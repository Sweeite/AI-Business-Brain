import type PgBoss from 'pg-boss'
import { JOB_TYPES } from './constants.js'

export async function scheduleSystemCrons(boss: PgBoss): Promise<void> {
  await Promise.all([
    boss.schedule(JOB_TYPES.MEMORY_PROPOSAL_DRAIN, '*/5 * * * *', {}),
    boss.schedule(JOB_TYPES.CONNECTOR_SYNC, '*/15 * * * *', {}),
    boss.schedule(JOB_TYPES.TOKEN_REFRESH, '*/30 * * * *', {}),
    boss.schedule(JOB_TYPES.DRIVE_WEBHOOK_RENEW, '0 1 * * *', {}),
  ])
  console.log('[worker] system crons scheduled')
}
