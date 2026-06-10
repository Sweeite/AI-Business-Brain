import type PgBoss from 'pg-boss'
import type { SupabaseClient } from '@brain/core'
import { JOB_TYPES } from './constants.js'
import { syncRoutineSchedules } from './handlers/routine-schedule-sync.js'

const DEFAULTS: Record<string, string> = {
  [JOB_TYPES.MEMORY_PROPOSAL_DRAIN]: '*/5 * * * *',
  [JOB_TYPES.CONNECTOR_SYNC]:        '*/15 * * * *',
  [JOB_TYPES.TOKEN_REFRESH]:         '*/30 * * * *',
  [JOB_TYPES.DRIVE_WEBHOOK_RENEW]:   '0 1 * * *',
  [JOB_TYPES.IMPROVEMENT_ANALYSIS]:  '0 6 * * 1',
  [JOB_TYPES.MEMORY_CONSOLIDATION]:  '0 2 * * *',
  [JOB_TYPES.MEMORY_DECAY]:          '0 3 * * 0',
}

const SCHEDULE_KEYS: Record<string, string> = {
  [JOB_TYPES.MEMORY_PROPOSAL_DRAIN]: 'memory_proposal_drain_schedule',
  [JOB_TYPES.CONNECTOR_SYNC]:        'connector_sync_schedule',
  [JOB_TYPES.TOKEN_REFRESH]:         'token_refresh_schedule',
  [JOB_TYPES.DRIVE_WEBHOOK_RENEW]:   'drive_webhook_renew_schedule',
  [JOB_TYPES.IMPROVEMENT_ANALYSIS]:  'improvement_analysis_cron_schedule',
  [JOB_TYPES.MEMORY_CONSOLIDATION]:  'consolidation_cron_schedule',
  [JOB_TYPES.MEMORY_DECAY]:          'decay_cron_schedule',
}

const ACTIVE_KEYS: Record<string, string> = {
  [JOB_TYPES.MEMORY_PROPOSAL_DRAIN]: 'memory_proposal_drain_active',
  [JOB_TYPES.CONNECTOR_SYNC]:        'connector_sync_active',
  [JOB_TYPES.TOKEN_REFRESH]:         'token_refresh_active',
  [JOB_TYPES.DRIVE_WEBHOOK_RENEW]:   'drive_webhook_renew_active',
  [JOB_TYPES.IMPROVEMENT_ANALYSIS]:  'improvement_analysis_active',
  [JOB_TYPES.MEMORY_CONSOLIDATION]:  'consolidation_active',
  [JOB_TYPES.MEMORY_DECAY]:          'memory_decay_active',
}

export async function scheduleSystemCrons(boss: PgBoss, supabase: SupabaseClient): Promise<void> {
  const allKeys = [
    ...Object.values(SCHEDULE_KEYS),
    ...Object.values(ACTIVE_KEYS),
  ]

  const { data: configs } = await supabase
    .from('system_config')
    .select('key, value')
    .in('key', allKeys)

  const configMap: Record<string, unknown> = {}
  for (const row of configs ?? []) {
    configMap[row.key] = row.value
  }

  await Promise.all(
    Object.keys(DEFAULTS).map(async (jobType) => {
      const scheduleKey = SCHEDULE_KEYS[jobType]
      const activeKey = ACTIVE_KEYS[jobType]

      const isActive = activeKey in configMap ? Boolean(configMap[activeKey]) : true
      const schedule =
        typeof configMap[scheduleKey] === 'string'
          ? configMap[scheduleKey] as string
          : DEFAULTS[jobType]

      if (isActive) {
        await boss.schedule(jobType, schedule, {})
        console.log(`[worker] scheduled ${jobType} @ ${schedule}`)
      } else {
        await boss.unschedule(jobType).catch(() => { /* not scheduled — ignore */ })
        console.log(`[worker] skipped (inactive) ${jobType}`)
      }
    })
  )

  console.log('[worker] system crons scheduled')

  // Sync user-defined cron routines from the routines table
  await syncRoutineSchedules(boss, supabase)
}
