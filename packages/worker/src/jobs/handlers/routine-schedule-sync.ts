import type PgBoss from 'pg-boss'
import type { SupabaseClient } from '@brain/core'

export function createRoutineScheduleSyncHandler(boss: PgBoss, supabase: SupabaseClient) {
  return async (_job: PgBoss.JobWithMetadata): Promise<void> => {
    await syncRoutineSchedules(boss, supabase)
  }
}

export async function syncRoutineSchedules(boss: PgBoss, supabase: SupabaseClient): Promise<void> {
  const { data: routines } = await supabase
    .from('routines')
    .select('id, cron_schedule, is_active')
    .eq('trigger_type', 'cron')

  if (!routines) return

  await Promise.all(
    routines.map(async (r) => {
      const jobName = `routine.run.${r.id}`
      if (r.is_active && r.cron_schedule) {
        try {
          await boss.schedule(jobName, r.cron_schedule, { routineId: r.id, triggeredBy: 'cron' })
        } catch (err) {
          console.error(`[routine-schedule-sync] failed to schedule ${jobName}:`, err)
        }
      } else {
        try {
          await boss.unschedule(jobName)
        } catch {
          // Not scheduled — ignore
        }
      }
    })
  )

  // Register a work handler for each dynamically-named schedule job so pg-boss can execute them.
  // The handler enqueues a routine.run job so the main handler processes it.
  for (const r of routines) {
    if (!r.is_active || !r.cron_schedule) continue
    const jobName = `routine.run.${r.id}`
    boss.work(jobName, { includeMetadata: true }, async (_job: PgBoss.JobWithMetadata) => {
      await boss.send('routine.run', { routineId: r.id, triggeredBy: 'cron' })
    })
  }

  console.log(`[routine-schedule-sync] synced ${routines.length} cron routine(s)`)
}
