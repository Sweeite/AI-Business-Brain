export const JOB_TYPES = {
  GMAIL_SYNC: 'gmail.sync',
  DRIVE_SYNC: 'drive.sync',
  CONNECTOR_SYNC: 'connector.sync',
  TOKEN_REFRESH: 'token.refresh',
  MEMORY_PROPOSAL_DRAIN: 'memory.proposal.drain',
  DRIVE_WEBHOOK_RENEW: 'drive.webhook.renew',
  ROUTINE_RUN: 'routine.run',
  ROUTINE_SCHEDULE_SYNC: 'routine.schedule.sync',
} as const

export type JobType = typeof JOB_TYPES[keyof typeof JOB_TYPES]
