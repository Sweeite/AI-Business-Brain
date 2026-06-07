import type PgBoss from 'pg-boss'
import type { SupabaseClient } from '@brain/core'
import { JOB_TYPES } from '../constants.js'
import { createJobRun, completeJobRun, failJobRun } from '../lifecycle.js'

export function createConnectorSyncHandler(supabase: SupabaseClient) {
  return async (_job: PgBoss.JobWithMetadata): Promise<void> => {
    const runId = await createJobRun(supabase, JOB_TYPES.CONNECTOR_SYNC, 'system')
    try {
      // stub — implemented in issues #8/#9
      await completeJobRun(supabase, runId)
    } catch (err) {
      await failJobRun(supabase, runId, err as Error)
      throw err
    }
  }
}
