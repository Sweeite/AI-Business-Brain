import type {
  MemoryType,
  SensitivityLevel,
  MemoryStatus,
  AuthorType,
  ConnectionScope,
  ConnectionStatus,
  RoutineTriggerType,
  OutputType,
  RoutineScope,
  JobStatus,
  TriggerType,
  MissReason,
  FeedbackType,
  ImprovementCategory,
  ImprovementStatus,
  ToolActionType,
  ClearanceLevel,
  AgentRunStatus,
} from '../schemas/index.js'

// ── roles ────────────────────────────────────────────────────────────────────

export interface Role {
  id: string
  name: string
  clearance_level: ClearanceLevel
  permissions: Record<string, boolean>
  created_at: string
}

export type RoleInsert = Omit<Role, 'created_at'> & { created_at?: string }
export type RoleUpdate = Partial<RoleInsert>

// ── users ────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  full_name: string | null
  role_id: string
  created_at: string
  last_seen_at: string | null
  is_active: boolean
}

export type UserInsert = Omit<User, 'created_at'> & { created_at?: string }
export type UserUpdate = Partial<UserInsert>

// ── agent_configs ────────────────────────────────────────────────────────────

export interface AgentConfig {
  id: string
  name: string
  description: string
  system_prompt: string
  model: string
  tool_ids: string[]
  required_role: string | null
  is_active: boolean
  version: number
  created_at: string
  updated_at: string
}

export type AgentConfigInsert = Omit<AgentConfig, 'created_at' | 'updated_at'> & {
  created_at?: string
  updated_at?: string
}
export type AgentConfigUpdate = Partial<AgentConfigInsert>

// ── agent_config_versions ────────────────────────────────────────────────────

export interface AgentConfigVersion {
  id: string
  agent_config_id: string
  version: number
  system_prompt: string
  model: string
  tool_ids: string[]
  changed_by: string
  change_reason: 'self_improvement_approval' | 'manual_edit' | 'rollback'
  improvement_suggestion_id: string | null
  created_at: string
}

export type AgentConfigVersionInsert = Omit<AgentConfigVersion, 'created_at'> & { created_at?: string }

// ── tools ────────────────────────────────────────────────────────────────────

export interface Tool {
  id: string
  name: string
  description: string
  connector_type: string
  action_type: ToolActionType
  required_permission: string
  input_schema: Record<string, unknown>
  output_schema: Record<string, unknown>
  is_active: boolean
}

export type ToolInsert = Tool
export type ToolUpdate = Partial<ToolInsert>

// ── memories ─────────────────────────────────────────────────────────────────

export interface Memory {
  id: string
  type: MemoryType
  content: string
  embedding: number[] | null
  search_vector: string | null  // generated column, read-only
  source_refs: Record<string, unknown>
  author_type: AuthorType
  author_id: string
  agent_task_id: string | null
  status: MemoryStatus
  valid_from: string
  valid_to: string | null
  sensitivity_level: SensitivityLevel
  zone: string | null
  namespace: string
  retrieval_count: number
  last_retrieved_at: string | null
  utility_score: number | null
  content_hash: string
  embedding_model: string
  embedding_model_version: string
  created_at: string
  updated_at: string
}

export type MemoryInsert = Omit<Memory, 'search_vector' | 'created_at' | 'updated_at'> & {
  created_at?: string
  updated_at?: string
}
export type MemoryUpdate = Partial<MemoryInsert>

// ── memory_proposals ─────────────────────────────────────────────────────────

export interface MemoryProposal {
  id: string
  claim: string
  suggested_type: MemoryType
  sources: Record<string, unknown>
  confidence: number
  entity_refs: Record<string, unknown>
  acting_user_id: string
  agent_id: string
  task_id: string
  status: 'pending' | 'pending_review' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export type MemoryProposalInsert = Omit<MemoryProposal, 'created_at'> & { created_at?: string }
export type MemoryProposalUpdate = Partial<MemoryProposalInsert>

// ── connections ───────────────────────────────────────────────────────────────

export interface Connection {
  id: string
  connector_type: string
  scope: ConnectionScope
  owner_user_id: string | null
  credential_ref: string
  status: ConnectionStatus
  granted_scopes: string[]
  last_synced_at: string | null
  webhook_expires_at: string | null
  sync_cursor: Record<string, unknown>
  exclusion_rules: Array<{ type: 'email' | 'domain'; value: string }>
  created_by: string
  created_at: string
}

export type ConnectionInsert = Omit<Connection, 'created_at' | 'sync_cursor' | 'exclusion_rules'> & {
  created_at?: string
  sync_cursor?: Record<string, unknown>
  exclusion_rules?: Array<{ type: 'email' | 'domain'; value: string }>
}
export type ConnectionUpdate = Partial<ConnectionInsert>

// ── routines ──────────────────────────────────────────────────────────────────

export interface Routine {
  id: string
  name: string
  description: string
  is_active: boolean
  trigger_type: RoutineTriggerType
  cron_schedule: string | null
  webhook_connector: string | null
  webhook_event: string | null
  webhook_filters: Record<string, unknown> | null
  agent_config_id: string
  additional_context: string | null
  output_type: OutputType
  output_config: Record<string, unknown>
  created_by: string
  scope: RoutineScope
  created_at: string
  updated_at: string
}

export type RoutineInsert = Omit<Routine, 'created_at' | 'updated_at'> & {
  created_at?: string
  updated_at?: string
}
export type RoutineUpdate = Partial<RoutineInsert>

// ── job_runs ──────────────────────────────────────────────────────────────────

export interface JobRun {
  id: string
  routine_id: string | null
  job_type: string
  triggered_by: TriggerType
  acting_user_id: string
  status: JobStatus
  started_at: string
  completed_at: string | null
  output: Record<string, unknown> | null
  error: string | null
  tokens_used: number | null
  cost_usd: string | null  // decimal stored as string
}

export type JobRunInsert = Omit<JobRun, 'id'> & { id?: string }
export type JobRunUpdate = Partial<JobRunInsert>

// ── agent_runs ────────────────────────────────────────────────────────────────

export interface AgentRun {
  id: string
  agent_config_id: string
  acting_user_id: string
  job_run_id: string | null
  trigger_context: Record<string, unknown>
  memory_retrieved: Record<string, unknown> | null
  tool_calls: Record<string, unknown> | null
  reasoning_trace: string | null
  output: string | null
  provenance_labels: Record<string, unknown> | null
  tokens_used: number | null
  cost_usd: string | null
  duration_ms: number | null
  user_rating: -1 | 0 | 1 | null
  user_feedback: string | null
  status: AgentRunStatus
  created_at: string
}

export type AgentRunInsert = Omit<AgentRun, 'created_at'> & { created_at?: string }
export type AgentRunUpdate = Partial<AgentRunInsert>

// ── miss_log ──────────────────────────────────────────────────────────────────

export interface MissLog {
  id: string
  query: string
  reason: MissReason
  user_id: string
  agent_run_id: string | null
  resolved: boolean
  created_at: string
}

export type MissLogInsert = Omit<MissLog, 'created_at'> & { created_at?: string }
export type MissLogUpdate = Partial<MissLogInsert>

// ── memory_feedback ───────────────────────────────────────────────────────────

export interface MemoryFeedback {
  id: string
  memory_id: string
  user_id: string
  rating: -1 | 0 | 1
  feedback_type: FeedbackType
  note: string | null
  created_at: string
}

export type MemoryFeedbackInsert = Omit<MemoryFeedback, 'created_at'> & { created_at?: string }

// ── improvement_suggestions ───────────────────────────────────────────────────

export interface ImprovementSuggestion {
  id: string
  category: ImprovementCategory
  title: string
  reasoning: string
  proposed_change: Record<string, unknown>
  target_config_id: string | null
  evidence: Record<string, unknown>
  status: ImprovementStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export type ImprovementSuggestionInsert = Omit<ImprovementSuggestion, 'created_at'> & { created_at?: string }
export type ImprovementSuggestionUpdate = Partial<ImprovementSuggestionInsert>

// ── audit_log ─────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  action_type: string
  actor_id: string
  actor_type: 'user' | 'system' | 'agent'
  target_type: string
  target_id: string
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export type AuditLogInsert = Omit<AuditLog, 'created_at'> & { created_at?: string }

// ── cost_events ───────────────────────────────────────────────────────────────

export interface CostEvent {
  id: string
  user_id: string
  agent_run_id: string | null
  job_run_id: string | null
  event_type: string
  tokens_input: number
  tokens_output: number
  cost_usd: string  // decimal stored as string
  model: string
  created_at: string
}

export type CostEventInsert = Omit<CostEvent, 'created_at'> & { created_at?: string }

// ── chunks ────────────────────────────────────────────────────────────────────

export interface Chunk {
  id: string
  source_ref: Record<string, unknown>
  content: string
  embedding: number[] | null
  search_vector: string | null  // generated column, read-only
  embedding_model: string
  connector_type: string
  owner_user_id: string | null
  created_at: string
}

export type ChunkInsert = Omit<Chunk, 'search_vector' | 'created_at'> & { created_at?: string }
export type ChunkUpdate = Partial<ChunkInsert>

// ── connector_schemas ─────────────────────────────────────────────────────────

export interface ConnectorSchema {
  id: string
  connector_type: string
  schema: Record<string, unknown>
  last_discovered_at: string
}

export type ConnectorSchemaInsert = ConnectorSchema
export type ConnectorSchemaUpdate = Partial<ConnectorSchemaInsert>

// ── system_config ─────────────────────────────────────────────────────────────

export interface SystemConfig {
  id: string
  key: string
  value: unknown
  updated_by: string | null
  updated_at: string
}

export type SystemConfigInsert = Omit<SystemConfig, 'updated_at'> & { updated_at?: string }
export type SystemConfigUpdate = Partial<SystemConfigInsert>

// Database type is the auto-generated type from database.types.ts — exported from index.ts.
// Do not duplicate it here; it lives exclusively in database.types.ts.
