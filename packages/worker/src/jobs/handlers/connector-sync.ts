import type PgBoss from 'pg-boss'
import type { SupabaseClient } from '@brain/core'
import { JOB_TYPES } from '../constants.js'
import { createJobRun, completeJobRun, failJobRun } from '../lifecycle.js'

export function createConnectorSyncHandler(supabase: SupabaseClient, boss: PgBoss) {
  return async (_job: PgBoss.JobWithMetadata): Promise<void> => {
    const runId = await createJobRun(supabase, JOB_TYPES.CONNECTOR_SYNC, 'cron')
    try {
      const { data: connections, error } = await supabase
        .from('connections')
        .select('id, connector_type, owner_user_id')
        .in('connector_type', ['gmail', 'google_drive'])
        .eq('status', 'active')

      if (error) throw new Error(`Failed to fetch connections: ${error.message}`)

      let enqueued = 0

      for (const conn of connections ?? []) {
        if (!conn.owner_user_id) continue

        if (conn.connector_type === 'gmail') {
          await boss.send(JOB_TYPES.GMAIL_SYNC, {
            userId: conn.owner_user_id,
            historyId: null,
            triggeredBy: 'cron',
          })
          enqueued++
        } else if (conn.connector_type === 'google_drive') {
          await boss.send(JOB_TYPES.DRIVE_SYNC, {
            userId: conn.owner_user_id,
            connectionId: conn.id,
            triggeredBy: 'cron',
          })
          enqueued++
        }
      }

      await completeJobRun(supabase, runId, { enqueued })
    } catch (err) {
      await failJobRun(supabase, runId, err as Error)
      throw err
    }
  }
}
