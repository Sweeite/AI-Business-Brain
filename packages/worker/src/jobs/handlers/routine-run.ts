import type PgBoss from 'pg-boss'
import {
  type SupabaseClient,
  executeAgent,
  writeMemory,
  SYSTEM_USER_ID,
} from '@brain/core'
import type { Permission } from '@brain/core'

const CLEARANCE_MAP: Record<string, number> = {
  public: 1,
  internal: 2,
  management: 3,
  leadership: 4,
}

interface RoutineRunData {
  routineId: string
  triggeredBy?: 'cron' | 'webhook' | 'manual'
}

export function createRoutineRunHandler(supabase: SupabaseClient) {
  return async (job: PgBoss.JobWithMetadata<RoutineRunData>): Promise<void> => {
    const { routineId, triggeredBy = 'cron' } = job.data

    // Load routine
    const { data: routine } = await supabase
      .from('routines')
      .select('*')
      .eq('id', routineId)
      .maybeSingle()

    if (!routine || !routine.is_active) {
      // Routine deleted or disabled — silently ack
      return
    }

    // Insert job_run row
    const actingUserId = routine.scope === 'system' ? SYSTEM_USER_ID : routine.created_by
    const { data: jobRunRow, error: jobRunErr } = await supabase
      .from('job_runs')
      .insert({
        routine_id: routineId,
        job_type: 'routine.run',
        triggered_by: triggeredBy,
        acting_user_id: actingUserId,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (jobRunErr || !jobRunRow) {
      throw new Error(`Failed to create job_run: ${jobRunErr?.message}`)
    }

    const jobRunId = jobRunRow.id

    try {
      // Load acting user
      const { data: actingUser } = await supabase
        .from('users')
        .select('id, email, full_name, role_id, created_at, last_seen_at, is_active, roles(id, name, clearance_level, permissions)')
        .eq('id', actingUserId)
        .single()

      if (!actingUser) throw new Error(`Acting user ${actingUserId} not found`)

      const rolesField = actingUser.roles as { id: string; name: string; clearance_level: string; permissions: Record<string, boolean> } | { id: string; name: string; clearance_level: string; permissions: Record<string, boolean> }[] | null
      const role = Array.isArray(rolesField) ? rolesField[0] : rolesField

      // Load agent config
      const { data: agentConfig } = await supabase
        .from('agent_configs')
        .select('id, system_prompt, model, tool_ids')
        .eq('id', routine.agent_config_id)
        .eq('is_active', true)
        .single()

      if (!agentConfig) throw new Error(`Agent config ${routine.agent_config_id} not found or inactive`)

      const toolIds = agentConfig.tool_ids as string[]

      // Load tools
      const { data: tools } = await supabase
        .from('tools')
        .select('*')
        .in('id', toolIds)
        .eq('is_active', true)

      // Build permissions
      const permissions: Permission[] = Object.entries(role?.permissions ?? {}).map(
        ([node, granted]) => ({ node, granted: granted as boolean })
      )

      // Build system prompt — inject additional_context if present
      let systemPrompt = agentConfig.system_prompt
      if (routine.additional_context) {
        systemPrompt = `${systemPrompt}\n\n## Routine Context\n${routine.additional_context}`
      }

      // Build trigger context
      const triggerContext = {
        type: triggeredBy === 'manual' ? ('cron' as const) : (triggeredBy as 'cron' | 'webhook'),
        routine_id: routineId,
        job_run_id: jobRunId,
        ...(triggeredBy === 'webhook' && routine.webhook_event
          ? { webhook_event: routine.webhook_event }
          : {}),
      }

      const clearanceLevel = CLEARANCE_MAP[role?.clearance_level ?? 'internal'] ?? 2
      const retrievalContext = { clearanceLevel, zones: [], namespaces: ['org'] }

      const user = {
        id: actingUser.id,
        email: actingUser.email,
        full_name: actingUser.full_name,
        role_id: actingUser.role_id ?? '',
        created_at: actingUser.created_at,
        last_seen_at: actingUser.last_seen_at,
        is_active: actingUser.is_active,
      }

      // Execute agent
      const result = await executeAgent({
        user,
        agentConfigId: agentConfig.id,
        model: agentConfig.model,
        systemPrompt,
        tools: (tools ?? []) as Parameters<typeof executeAgent>[0]['tools'],
        triggerContext,
        permissions,
        serviceClient: supabase,
        retrievalContext,
        jobRunId,
      })

      // Route output
      let outputPayload: Record<string, unknown> = {
        agentOutput: result.output,
        provenanceLabels: result.provenanceLabels,
        agentRunId: result.agentRunId,
        outputType: routine.output_type,
      }

      if (routine.output_type === 'memory' && result.status === 'completed') {
        const { id: memoryId } = await writeMemory({
          type: 'episodic',
          content: result.output,
          sourceRefs: { routine_id: routineId, agent_run_id: result.agentRunId },
          authorType: 'agent',
          authorId: actingUserId,
          sensitivityLevel: 'internal',
          namespace: 'org',
          serviceClient: supabase,
        })
        outputPayload.memoryId = memoryId
      }

      // For email / slack / tool_write / dashboard_notification: store config in output.
      // Actual delivery integrations are not yet built; the output record is visible in the dashboard.
      if (routine.output_type !== 'memory') {
        outputPayload.outputConfig = routine.output_config
        outputPayload.deliveryStatus = 'pending_integration'
      }

      await supabase
        .from('job_runs')
        .update({
          status: result.status,
          completed_at: new Date().toISOString(),
          output: outputPayload,
          tokens_used: result.tokensUsed,
          cost_usd: result.costUsd,
          error: result.error ?? null,
        })
        .eq('id', jobRunId)

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[routine-run] error for routine ${routineId}:`, message)
      await supabase
        .from('job_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: message,
        })
        .eq('id', jobRunId)
      throw err
    }
  }
}
