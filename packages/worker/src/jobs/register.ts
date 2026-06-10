import type PgBoss from 'pg-boss'
import type { SupabaseClient } from '@brain/core'
import { JOB_TYPES } from './constants.js'
import { createGmailSyncHandler } from './handlers/gmail-sync.js'
import { createDriveSyncHandler } from './handlers/drive-sync.js'
import { createConnectorSyncHandler } from './handlers/connector-sync.js'
import { createTokenRefreshHandler } from './handlers/token-refresh.js'
import { createMemoryProposalDrainHandler } from './handlers/memory-proposal-drain.js'
import { createDriveWebhookRenewHandler } from './handlers/drive-webhook-renew.js'
import { createRoutineRunHandler } from './handlers/routine-run.js'
import { createRoutineScheduleSyncHandler } from './handlers/routine-schedule-sync.js'
import { createImprovementAnalysisHandler } from './handlers/improvement-analysis.js'
import { createMemoryConsolidationHandler } from './handlers/memory-consolidation.js'
import { createMemoryDecayHandler } from './handlers/memory-decay.js'

export function registerAllJobs(boss: PgBoss, supabase: SupabaseClient): void {
  boss.work(JOB_TYPES.GMAIL_SYNC, { includeMetadata: true }, createGmailSyncHandler(supabase))
  boss.work(JOB_TYPES.DRIVE_SYNC, { includeMetadata: true }, createDriveSyncHandler(supabase))
  boss.work(JOB_TYPES.CONNECTOR_SYNC, { includeMetadata: true }, createConnectorSyncHandler(supabase, boss))
  boss.work(JOB_TYPES.TOKEN_REFRESH, { includeMetadata: true }, createTokenRefreshHandler(supabase))
  boss.work(JOB_TYPES.MEMORY_PROPOSAL_DRAIN, { includeMetadata: true }, createMemoryProposalDrainHandler(supabase))
  boss.work(JOB_TYPES.DRIVE_WEBHOOK_RENEW, { includeMetadata: true }, createDriveWebhookRenewHandler(supabase))
  boss.work(JOB_TYPES.ROUTINE_RUN, { includeMetadata: true }, createRoutineRunHandler(supabase))
  boss.work(JOB_TYPES.ROUTINE_SCHEDULE_SYNC, { includeMetadata: true }, createRoutineScheduleSyncHandler(boss, supabase))
  boss.work(JOB_TYPES.IMPROVEMENT_ANALYSIS, { includeMetadata: true }, createImprovementAnalysisHandler(supabase))
  boss.work(JOB_TYPES.MEMORY_CONSOLIDATION, { includeMetadata: true }, createMemoryConsolidationHandler(supabase))
  boss.work(JOB_TYPES.MEMORY_DECAY, { includeMetadata: true }, createMemoryDecayHandler(supabase))

  console.log('[worker] registered handlers:', Object.values(JOB_TYPES).join(', '))
}
