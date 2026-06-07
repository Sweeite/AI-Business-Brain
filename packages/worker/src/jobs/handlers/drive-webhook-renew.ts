import type PgBoss from 'pg-boss'
import type { SupabaseClient } from '@brain/core'
import { getCredential } from '@brain/core'
import { JOB_TYPES } from '../constants.js'
import { createJobRun, completeJobRun, failJobRun } from '../lifecycle.js'

interface DriveToken {
  access_token: string
  refresh_token: string
  expires_at: number
}

interface DriveWatchResponse {
  id: string
  resourceId: string
  expiration?: string
}

export function createDriveWebhookRenewHandler(supabase: SupabaseClient) {
  return async (_job: PgBoss.JobWithMetadata): Promise<void> => {
    const runId = await createJobRun(supabase, JOB_TYPES.DRIVE_WEBHOOK_RENEW, 'cron')
    try {
      // Load channel token from system_config
      const { data: configRow } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'drive_webhook_channel_token')
        .maybeSingle()

      const channelToken = (configRow?.value as string | undefined) ?? ''
      const webhookEnabled = channelToken && channelToken !== 'REPLACE_WITH_SECRET'

      // Find active Drive connections expiring within 48 hours
      const cutoff = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      const { data: connections, error } = await supabase
        .from('connections')
        .select('id, sync_cursor')
        .eq('connector_type', 'google_drive')
        .eq('status', 'active')
        .lt('webhook_expires_at', cutoff)

      if (error) throw new Error(`Failed to fetch connections: ${error.message}`)

      let renewed = 0, failed = 0

      for (const conn of connections ?? []) {
        try {
          // Get a valid access token
          const rawToken = await getCredential(supabase, conn.id)
          const token = JSON.parse(rawToken) as DriveToken

          let accessToken = token.access_token
          if (token.expires_at < Date.now()) {
            // Refresh inline — token-refresh cron may not have run yet
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
            const data = await res.json() as { access_token?: string; error?: string }
            if (!res.ok || !data.access_token) {
              await supabase.from('connections').update({ status: 'error' }).eq('id', conn.id)
              failed++
              continue
            }
            accessToken = data.access_token
          }

          if (!webhookEnabled) {
            // No channel token configured — skip watch renewal but don't error
            renewed++
            continue
          }

          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!
          const watchRes = await fetch(
            'https://www.googleapis.com/drive/v3/changes/watch',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                id: conn.id,
                type: 'web_hook',
                address: `${siteUrl}/api/webhooks/drive`,
                token: channelToken,
                expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
              }),
            },
          )

          if (!watchRes.ok) {
            const errBody = await watchRes.text()
            console.error(`[drive-webhook-renew] watch failed for ${conn.id}:`, errBody)
            await supabase.from('connections').update({ status: 'error' }).eq('id', conn.id)
            failed++
            continue
          }

          const watchData = await watchRes.json() as DriveWatchResponse
          const webhookExpiresAt = watchData.expiration
            ? new Date(parseInt(watchData.expiration)).toISOString()
            : null

          const cursor = (conn.sync_cursor ?? {}) as Record<string, unknown>
          await supabase
            .from('connections')
            .update({
              webhook_expires_at: webhookExpiresAt,
              sync_cursor: {
                ...cursor,
                channelId: watchData.id,
                resourceId: watchData.resourceId,
              },
            })
            .eq('id', conn.id)

          renewed++
        } catch (err) {
          console.error(`[drive-webhook-renew] error on connection ${conn.id}:`, err)
          await supabase.from('connections').update({ status: 'error' }).eq('id', conn.id)
          failed++
        }
      }

      await completeJobRun(supabase, runId, { renewed, failed })
    } catch (err) {
      await failJobRun(supabase, runId, err as Error)
      throw err
    }
  }
}
