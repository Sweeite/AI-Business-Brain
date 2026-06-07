import { SYSTEM_USER_ID } from '@brain/core'
import type { SupabaseClient } from '@brain/core'
import type { JobType } from './constants.js'

export async function createJobRun(
  supabase: SupabaseClient,
  jobType: JobType,
  triggeredBy: 'cron' | 'webhook' | 'manual' | 'system',
): Promise<string> {
  const { data, error } = await supabase
    .from('job_runs')
    .insert({
      job_type: jobType,
      triggered_by: triggeredBy,
      acting_user_id: SYSTEM_USER_ID,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create job_run: ${error?.message ?? 'no data returned'}`)
  }

  return data.id
}

export async function completeJobRun(
  supabase: SupabaseClient,
  id: string,
  output?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('job_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      ...(output ? { output } : {}),
    })
    .eq('id', id)

  if (error) {
    console.error(`[lifecycle] failed to mark job_run ${id} completed:`, error.message)
  }
}

export async function failJobRun(
  supabase: SupabaseClient,
  id: string,
  err: Error,
): Promise<void> {
  const { error } = await supabase
    .from('job_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: err.message,
    })
    .eq('id', id)

  if (error) {
    console.error(`[lifecycle] failed to mark job_run ${id} failed:`, error.message)
  }
}
