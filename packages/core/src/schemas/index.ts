import { z } from 'zod'

export const MemoryType = z.enum(['episodic', 'semantic', 'procedural'])
export type MemoryType = z.infer<typeof MemoryType>

export const SensitivityLevel = z.enum(['public', 'internal', 'management', 'leadership'])
export type SensitivityLevel = z.infer<typeof SensitivityLevel>

export const MemoryStatus = z.enum(['active', 'invalidated'])
export type MemoryStatus = z.infer<typeof MemoryStatus>

export const AuthorType = z.enum(['human', 'agent'])
export type AuthorType = z.infer<typeof AuthorType>

export const ConnectionScope = z.enum(['org', 'per-user'])
export type ConnectionScope = z.infer<typeof ConnectionScope>

export const ConnectionStatus = z.enum(['active', 'expired', 'revoked', 'error'])
export type ConnectionStatus = z.infer<typeof ConnectionStatus>

export const RoutineTriggerType = z.enum(['cron', 'webhook'])
export type RoutineTriggerType = z.infer<typeof RoutineTriggerType>

export const OutputType = z.enum(['email', 'slack', 'memory', 'dashboard_notification', 'tool_write'])
export type OutputType = z.infer<typeof OutputType>

export const RoutineScope = z.enum(['system', 'user'])
export type RoutineScope = z.infer<typeof RoutineScope>

export const JobStatus = z.enum(['pending', 'running', 'completed', 'failed'])
export type JobStatus = z.infer<typeof JobStatus>

export const TriggerType = z.enum(['cron', 'webhook', 'manual', 'system'])
export type TriggerType = z.infer<typeof TriggerType>

export const MissReason = z.enum(['no_memory', 'below_relevance_floor', 'source_unavailable'])
export type MissReason = z.infer<typeof MissReason>

export const FeedbackType = z.enum(['wrong', 'stale', 'stop_storing', 'helpful'])
export type FeedbackType = z.infer<typeof FeedbackType>

export const ImprovementCategory = z.enum([
  'memory_quality',
  'agent_prompt',
  'retrieval_settings',
  'capture_rules',
  'decay_settings',
])
export type ImprovementCategory = z.infer<typeof ImprovementCategory>

export const ImprovementStatus = z.enum(['pending', 'approved', 'rejected'])
export type ImprovementStatus = z.infer<typeof ImprovementStatus>

export const ToolActionType = z.enum(['read', 'write'])
export type ToolActionType = z.infer<typeof ToolActionType>

export const ClearanceLevel = z.enum(['public', 'internal', 'management', 'leadership'])
export type ClearanceLevel = z.infer<typeof ClearanceLevel>

export const AgentRunStatus = z.enum(['running', 'completed', 'failed'])
export type AgentRunStatus = z.infer<typeof AgentRunStatus>
