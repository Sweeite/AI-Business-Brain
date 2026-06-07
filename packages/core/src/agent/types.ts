import { z } from 'zod'

export const TriggerContext = z.object({
  type: z.enum(['user_query', 'cron', 'webhook']),
  query: z.string().optional(),
  routine_id: z.string().uuid().optional(),
  webhook_event: z.string().optional(),
  job_run_id: z.string().uuid().optional(),
})
export type TriggerContext = z.infer<typeof TriggerContext>

export interface Permission {
  node: string
  granted: boolean
}

export type ProvenanceLabelType = 'memory' | 'live' | 'source_unavailable' | 'inference'

export interface ProvenanceLabel {
  type: ProvenanceLabelType
  source_ref?: string
  as_of?: string
}

export interface AgentResult {
  output: string
  provenanceLabels: ProvenanceLabel[]
  agentRunId: string
  tokensUsed: number
  costUsd: number
  status: 'completed' | 'failed'
  error?: string
}
