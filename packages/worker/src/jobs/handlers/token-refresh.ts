import type PgBoss from 'pg-boss'
import type { SupabaseClient } from '@brain/core'
import { getCredential, refreshCredential } from '@brain/core'
import { JOB_TYPES } from '../constants.js'
import { createJobRun, completeJobRun, failJobRun } from '../lifecycle.js'

interface GmailToken {
  access_token: string
  refresh_token: string
  expires_at: number
}

const ONE_HOUR_MS = 60 * 60 * 1000

async function refreshGoogleToken(
  supabase: SupabaseClient,
  connectionId: string,
  token: GmailToken,
): Promise<'refreshed' | 'expired'> {
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
    // Refresh token revoked or expired — mark connection expired
    await supabase
      .from('connections')
      .update({ status: 'expired' })
      .eq('id', connectionId)
    return 'expired'
  }

  const newToken: GmailToken = {
    access_token: data.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + ((data.expires_in ?? 3600) - 300) * 1000,
  }
  await refreshCredential(supabase, connectionId, JSON.stringify(newToken))
  return 'refreshed'
}

export function createTokenRefreshHandler(supabase: SupabaseClient) {
  return async (_job: PgBoss.JobWithMetadata): Promise<void> => {
    const runId = await createJobRun(supabase, JOB_TYPES.TOKEN_REFRESH, 'cron')
    try {
      const { data: connections, error } = await supabase
        .from('connections')
        .select('id, connector_type')
        .in('connector_type', ['gmail'])
        .eq('status', 'active')

      if (error) throw new Error(`Failed to fetch connections: ${error.message}`)

      let checked = 0, refreshed = 0, expired = 0, errors = 0

      for (const conn of connections ?? []) {
        checked++
        try {
          const rawToken = await getCredential(supabase, conn.id)
          const token = JSON.parse(rawToken) as GmailToken

          // Skip if not expiring within the next hour
          if (token.expires_at > Date.now() + ONE_HOUR_MS) continue

          const result = await refreshGoogleToken(supabase, conn.id, token)
          if (result === 'refreshed') refreshed++
          else expired++
        } catch (err) {
          errors++
          console.error(`[token-refresh] error on connection ${conn.id}:`, err)
        }
      }

      await completeJobRun(supabase, runId, { checked, refreshed, expired, errors })
    } catch (err) {
      await failJobRun(supabase, runId, err as Error)
      throw err
    }
  }
}
