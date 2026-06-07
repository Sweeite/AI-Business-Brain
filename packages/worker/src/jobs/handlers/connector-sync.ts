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
        .eq('connector_type', 'gmail')
        .eq('status', 'active')

      if (error) throw new Error(`Failed to fetch connections: ${error.message}`)

      let enqueued = 0

      for (const conn of connections ?? []) {
        if (!conn.owner_user_id) continue
        await boss.send(JOB_TYPES.GMAIL_SYNC, { userId: conn.owner_user_id, historyId: null })
        enqueued++
      }

      await completeJobRun(supabase, runId, { enqueued })
    } catch (err) {
      await failJobRun(supabase, runId, err as Error)
      throw err
    }
  }
}
