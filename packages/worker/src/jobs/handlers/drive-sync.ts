import type PgBoss from 'pg-boss'
import type { SupabaseClient } from '@brain/core'
import { getCredential, refreshCredential, runRoutingPipeline } from '@brain/core'
import type { ExclusionRule, ClassifierConfig } from '@brain/core'
import { JOB_TYPES } from '../constants.js'
import { createJobRun, completeJobRun, failJobRun } from '../lifecycle.js'

interface DriveSyncData {
  userId: string
  connectionId?: string
  pageToken?: string | null
}

interface DriveToken {
  access_token: string
  refresh_token: string
  expires_at: number
}

interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
}

interface DriveFilesListResponse {
  files?: DriveFile[]
  nextPageToken?: string
}

interface DriveChangesResponse {
  changes?: Array<{ file?: DriveFile; removed?: boolean }>
  nextPageToken?: string
  newStartPageToken?: string
}

async function driveFetch<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Drive API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

async function extractFileContent(
  file: DriveFile,
  accessToken: string,
): Promise<string | null> {
  const { id, name, mimeType } = file

  const googleExportMap: Record<string, string> = {
    'application/vnd.google-apps.document': 'text/plain',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'text/plain',
  }

  const exportMime = googleExportMap[mimeType]

  try {
    if (exportMime) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(exportMime)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!res.ok) return null
      const text = await res.text()
      return `File: ${name}\n\n${text}`
    }

    if (mimeType.startsWith('text/')) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!res.ok) return null
      const text = await res.text()
      return `File: ${name}\n\n${text}`
    }

    // Binary, image, video, etc. — skip
    return null
  } catch {
    return null
  }
}

async function refreshDriveToken(
  supabase: SupabaseClient,
  connectionId: string,
  token: DriveToken,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(`Drive token refresh failed: ${data.error ?? res.status}`)
  }
  const newToken: DriveToken = {
    access_token: data.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + ((data.expires_in ?? 3600) - 300) * 1000,
  }
  await refreshCredential(supabase, connectionId, JSON.stringify(newToken))
  return newToken.access_token
}

async function loadClassifierConfigs(supabase: SupabaseClient): Promise<{
  docClassifier: ClassifierConfig
  chunkClassifier: ClassifierConfig
}> {
  const { data, error } = await supabase
    .from('agent_configs')
    .select('id, name, model, system_prompt')
    .in('name', ['system.ingestion.gate3_classifier', 'system.ingestion.gate3_chunk_classifier'])

  if (error || !data || data.length < 2) {
    throw new Error(`Failed to load Gate 3 agent configs: ${error?.message ?? 'not found'}`)
  }

  const docConfig = data.find(c => c.name === 'system.ingestion.gate3_classifier')
  const chunkConfig = data.find(c => c.name === 'system.ingestion.gate3_chunk_classifier')

  if (!docConfig || !chunkConfig) throw new Error('Gate 3 agent configs missing from DB')

  return {
    docClassifier: { id: docConfig.id, model: docConfig.model, system_prompt: docConfig.system_prompt },
    chunkClassifier: { id: chunkConfig.id, model: chunkConfig.model, system_prompt: chunkConfig.system_prompt },
  }
}

export function createDriveSyncHandler(supabase: SupabaseClient) {
  return async (job: PgBoss.JobWithMetadata): Promise<void> => {
    const data = (job.data ?? {}) as DriveSyncData
    const { userId, connectionId: jobConnectionId } = data

    const runId = await createJobRun(supabase, JOB_TYPES.DRIVE_SYNC, 'webhook')
    try {
      // Load connection
      const query = supabase
        .from('connections')
        .select('id, owner_user_id, sync_cursor, exclusion_rules, status')
        .eq('connector_type', 'google_drive')
        .eq('owner_user_id', userId)
        .eq('status', 'active')

      const { data: conn, error: connErr } = jobConnectionId
        ? await query.eq('id', jobConnectionId).maybeSingle()
        : await query.maybeSingle()

      if (connErr || !conn) {
        await completeJobRun(supabase, runId, { skipped: true, reason: 'no_active_connection' })
        return
      }

      // Load token from Vault, refresh if expired
      const rawToken = await getCredential(supabase, conn.id)
      let token = JSON.parse(rawToken) as DriveToken

      if (token.expires_at < Date.now()) {
        token.access_token = await refreshDriveToken(supabase, conn.id, token)
      }

      const exclusionRules = (conn.exclusion_rules ?? []) as ExclusionRule[]
      const cursor = (conn.sync_cursor ?? {}) as Record<string, unknown>
      const storedPageToken = cursor['pageToken'] as string | null | undefined
      const { docClassifier, chunkClassifier } = await loadClassifierConfigs(supabase)

      let files: DriveFile[] = []
      let newPageToken: string | null = null

      if (!storedPageToken) {
        // Initial sync: list all non-folder files
        let pageToken: string | undefined
        do {
          const qs = new URLSearchParams({
            q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
            fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)',
            pageSize: '100',
            ...(pageToken ? { pageToken } : {}),
          })
          const list = await driveFetch<DriveFilesListResponse>(
            `/files?${qs}`,
            token.access_token,
          )
          files.push(...(list.files ?? []))
          pageToken = list.nextPageToken
        } while (pageToken)

        // Get start page token for future deltas
        try {
          const spt = await driveFetch<{ startPageToken?: string }>(
            '/changes/startPageToken',
            token.access_token,
          )
          newPageToken = spt.startPageToken ?? null
        } catch {
          // non-fatal — next sync will use null and re-list
        }
      } else {
        // Delta sync: use Changes API
        let pageToken: string | undefined = storedPageToken
        do {
          const qs: URLSearchParams = new URLSearchParams({
            pageToken: pageToken!,
            fields: 'nextPageToken,newStartPageToken,changes(removed,file(id,name,mimeType,modifiedTime))',
          })
          const changes: DriveChangesResponse = await driveFetch<DriveChangesResponse>(
            `/changes?${qs}`,
            token.access_token,
          )
          for (const change of changes.changes ?? []) {
            if (!change.removed && change.file) {
              files.push(change.file)
            }
          }
          newPageToken = changes.newStartPageToken ?? changes.nextPageToken ?? storedPageToken
          pageToken = changes.nextPageToken
        } while (pageToken)
      }

      let processed = 0, indexed = 0, proposed = 0, dropped = 0, errors = 0

      for (const file of files) {
        const content = await extractFileContent(file, token.access_token)
        if (!content) { dropped++; continue }

        const sourceRef = {
          connector: 'google_drive',
          connection_id: conn.id,
          file_id: file.id,
          name: file.name,
          mimeType: file.mimeType,
        }

        try {
          const result = await runRoutingPipeline({
            content,
            senderEmail: '',
            connectorType: 'google_drive',
            ownerUserId: userId,
            jobRunId: runId,
            sourceRef,
            exclusionRules,
            docClassifierConfig: docClassifier,
            chunkClassifierConfig: chunkClassifier,
            serviceClient: supabase,
          })
          processed++
          if (result.outcome === 'indexed') indexed++
          else if (result.outcome === 'memory_proposed') proposed++
          else dropped++
        } catch (err) {
          console.error(`[drive-sync] routing pipeline error for file ${file.id}:`, err)
          errors++
        }
      }

      // Update sync cursor and last_synced_at
      const updatedCursor: Record<string, unknown> = {
        ...cursor,
        pageToken: newPageToken ?? storedPageToken,
        syncedAt: new Date().toISOString(),
      }
      await supabase
        .from('connections')
        .update({ sync_cursor: updatedCursor, last_synced_at: new Date().toISOString() })
        .eq('id', conn.id)

      await completeJobRun(supabase, runId, { processed, indexed, proposed, dropped, errors })
    } catch (err) {
      await failJobRun(supabase, runId, err as Error)
      throw err
    }
  }
}
