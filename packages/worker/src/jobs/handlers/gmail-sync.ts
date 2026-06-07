import type PgBoss from 'pg-boss'
import type { SupabaseClient } from '@brain/core'
import { getCredential, refreshCredential, runRoutingPipeline } from '@brain/core'
import type { ExclusionRule, ClassifierConfig } from '@brain/core'
import { JOB_TYPES } from '../constants.js'
import { createJobRun, completeJobRun, failJobRun } from '../lifecycle.js'

interface GmailSyncData {
  userId: string
  historyId: string | null | undefined
}

interface GmailToken {
  access_token: string
  refresh_token: string
  expires_at: number
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailMessagePart {
  mimeType: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number }
  parts?: GmailMessagePart[]
}

interface GmailMessage {
  id: string
  historyId?: string
  payload: GmailMessagePart
}

interface GmailListResponse {
  messages?: Array<{ id: string }>
  nextPageToken?: string
}

interface GmailHistoryResponse {
  history?: Array<{
    messagesAdded?: Array<{ message: { id: string } }>
  }>
  historyId?: string
  nextPageToken?: string
}

async function gmailFetch<T>(
  path: string,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gmail API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

function extractEmailBody(part: GmailMessagePart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf-8')
  }
  if (part.parts) {
    const textPart = part.parts.find(p => p.mimeType === 'text/plain')
    if (textPart) return extractEmailBody(textPart)
    const htmlPart = part.parts.find(p => p.mimeType === 'text/html')
    if (htmlPart) {
      const raw = Buffer.from(htmlPart.body?.data ?? '', 'base64url').toString('utf-8')
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    for (const p of part.parts) {
      const text = extractEmailBody(p)
      if (text) return text
    }
  }
  return ''
}

function headerValue(headers: GmailHeader[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function parseSenderEmail(from: string): string {
  return from.match(/<([^>]+)>/)?.[1] ?? from.trim()
}

async function refreshGmailToken(
  supabase: SupabaseClient,
  connectionId: string,
  token: GmailToken,
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
    throw new Error(`Token refresh failed: ${data.error ?? res.status}`)
  }
  const newToken: GmailToken = {
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

async function processMessage(
  messageId: string,
  accessToken: string,
  connectionId: string,
  ownerUserId: string,
  jobRunId: string,
  exclusionRules: ExclusionRule[],
  docClassifier: ClassifierConfig,
  chunkClassifier: ClassifierConfig,
  supabase: SupabaseClient,
): Promise<'dropped' | 'indexed' | 'memory_proposed' | 'error'> {
  let message: GmailMessage
  try {
    message = await gmailFetch<GmailMessage>(
      `/users/me/messages/${messageId}?format=full`,
      accessToken,
    )
  } catch (err) {
    console.error(`[gmail-sync] failed to fetch message ${messageId}:`, err)
    return 'error'
  }

  const headers = message.payload.headers ?? []
  const from = headerValue(headers, 'From')
  const subject = headerValue(headers, 'Subject')
  const senderEmail = parseSenderEmail(from)
  const body = extractEmailBody(message.payload)

  if (!body.trim()) return 'dropped'

  const content = `From: ${from}\nSubject: ${subject}\n\n${body}`
  const sourceRef = {
    connector: 'gmail',
    connection_id: connectionId,
    message_id: messageId,
    history_id: message.historyId,
  }

  try {
    const result = await runRoutingPipeline({
      content,
      senderEmail,
      connectorType: 'gmail',
      ownerUserId,
      jobRunId,
      sourceRef,
      exclusionRules,
      docClassifierConfig: docClassifier,
      chunkClassifierConfig: chunkClassifier,
      serviceClient: supabase,
    })
    return result.outcome
  } catch (err) {
    console.error(`[gmail-sync] routing pipeline error for message ${messageId}:`, err)
    return 'error'
  }
}

export function createGmailSyncHandler(supabase: SupabaseClient) {
  return async (job: PgBoss.JobWithMetadata): Promise<void> => {
    const data = (job.data ?? {}) as GmailSyncData
    const { userId, historyId: newHistoryId } = data

    const runId = await createJobRun(supabase, JOB_TYPES.GMAIL_SYNC, 'webhook')
    try {
      // Load connection
      const { data: conn, error: connErr } = await supabase
        .from('connections')
        .select('id, owner_user_id, sync_cursor, exclusion_rules, status')
        .eq('connector_type', 'gmail')
        .eq('owner_user_id', userId)
        .eq('status', 'active')
        .maybeSingle()

      if (connErr || !conn) {
        await completeJobRun(supabase, runId, { skipped: true, reason: 'no_active_connection' })
        return
      }

      // Load token from Vault
      const rawToken = await getCredential(supabase, conn.id)
      let token = JSON.parse(rawToken) as GmailToken

      // Refresh if expired
      if (token.expires_at < Date.now()) {
        token.access_token = await refreshGmailToken(supabase, conn.id, token)
      }

      const exclusionRules = (conn.exclusion_rules ?? []) as ExclusionRule[]
      const cursor = (conn.sync_cursor ?? {}) as Record<string, unknown>
      const { docClassifier, chunkClassifier } = await loadClassifierConfigs(supabase)

      let messageIds: string[] = []
      const isInitialSync = !cursor['historyId']

      if (isInitialSync) {
        // Initial sync: list recent messages
        const list = await gmailFetch<GmailListResponse>(
          '/users/me/messages?maxResults=500&q=in:inbox',
          token.access_token,
        )
        messageIds = (list.messages ?? []).map(m => m.id)
      } else {
        // Delta sync: use history API
        const startHistoryId = String(cursor['historyId'])
        let pageToken: string | undefined
        do {
          const qs = new URLSearchParams({
            startHistoryId,
            historyTypes: 'messageAdded',
            ...(pageToken ? { pageToken } : {}),
          })
          const historyResp = await gmailFetch<GmailHistoryResponse>(
            `/users/me/history?${qs}`,
            token.access_token,
          )
          for (const h of historyResp.history ?? []) {
            for (const ma of h.messagesAdded ?? []) {
              messageIds.push(ma.message.id)
            }
          }
          pageToken = historyResp.nextPageToken
        } while (pageToken)
      }

      let processed = 0, indexed = 0, proposed = 0, dropped = 0, errors = 0

      for (const messageId of messageIds) {
        const outcome = await processMessage(
          messageId,
          token.access_token,
          conn.id,
          userId,
          runId,
          exclusionRules,
          docClassifier,
          chunkClassifier,
          supabase,
        )
        processed++
        if (outcome === 'indexed') indexed++
        else if (outcome === 'memory_proposed') proposed++
        else if (outcome === 'dropped') dropped++
        else errors++
      }

      // Update sync cursor
      const updatedCursor: Record<string, unknown> = {
        ...cursor,
        historyId: newHistoryId ?? cursor['historyId'],
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
