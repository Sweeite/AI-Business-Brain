import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ToolUseBlock, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { User, Tool, Memory, MemoryProposalInsert } from '../db/types.js'
import type { SupabaseClient } from '../supabase/client.js'
import type { TriggerContext, Permission, ProvenanceLabel, AgentResult } from './types.js'
import { calculateCost } from './cost.js'
import { retrieveMemories } from '../memory/retrieve.js'
import type { RetrievalContext } from '../memory/retrieve.js'

export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'

const GRACEFUL_ERROR = "I'm having trouble reaching my reasoning engine right now. Please try again in a moment."

interface ToolCallLog {
  tool_use_id: string
  name: string
  input: unknown
  output: unknown
  permitted: boolean
}

export async function executeAgent(params: {
  user: User
  agentConfigId: string
  model: string
  systemPrompt: string
  tools: Tool[]
  memoryContext?: Memory[]
  triggerContext: TriggerContext
  permissions: Permission[]
  serviceClient: SupabaseClient
  retrievalContext?: RetrievalContext
  jobRunId?: string
}): Promise<AgentResult> {
  const {
    user, agentConfigId, model, systemPrompt, tools,
    memoryContext = [], triggerContext, permissions,
    serviceClient, retrievalContext, jobRunId,
  } = params

  const startedAt = Date.now()
  const actorType = user.id === SYSTEM_USER_ID ? 'system' : 'user'

  // 1. Insert agent_run row at start (status: 'running') to obtain the ID upfront.
  const { data: runRow, error: insertError } = await serviceClient
    .from('agent_runs')
    .insert({
      agent_config_id: agentConfigId,
      acting_user_id: user.id,
      job_run_id: jobRunId ?? null,
      trigger_context: triggerContext as Record<string, unknown>,
      status: 'running',
      memory_retrieved: null,
      tool_calls: null,
      reasoning_trace: null,
      output: null,
      provenance_labels: null,
      tokens_used: null,
      cost_usd: null,
      duration_ms: null,
      user_rating: null,
      user_feedback: null,
    })
    .select('id')
    .single()

  if (insertError || !runRow) {
    const err = new Error(`Failed to create agent_run row: ${insertError?.message}`)
    if (triggerContext.type === 'user_query') {
      return {
        output: GRACEFUL_ERROR,
        provenanceLabels: [],
        agentRunId: '',
        tokensUsed: 0,
        costUsd: 0,
        status: 'failed',
        error: err.message,
      }
    }
    throw err
  }

  const agentRunId = runRow.id

  // 2. Write start audit log entry — references only, never content.
  await serviceClient.from('audit_log').insert({
    action_type: 'query',
    actor_id: user.id,
    actor_type: actorType,
    target_type: 'agent_run',
    target_id: agentRunId,
    metadata: { agent_config_id: agentConfigId, trigger_type: triggerContext.type },
    ip_address: null,
  })

  const toolCallsLog: ToolCallLog[] = []
  const pendingProposals: MemoryProposalInsert[] = []
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let finalOutput = ''

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // 3. Build initial user message, prepending retrieved memories if any.
    const userContent = buildUserMessage(triggerContext, memoryContext)
    const messages: MessageParam[] = [{ role: 'user', content: userContent }]

    // Convert DB tools to Anthropic format.
    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool['input_schema'],
    }))

    // 4. Agentic loop.
    while (true) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      })

      totalInputTokens += response.usage.input_tokens
      totalOutputTokens += response.usage.output_tokens

      if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
        finalOutput = extractTextContent(response.content)
        break
      }

      if (response.stop_reason === 'tool_use') {
        const toolResults: ToolResultBlockParam[] = []

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue
          const toolBlock = block as ToolUseBlock
          const tool = tools.find((t) => t.name === toolBlock.name)
          const permitted = tool
            ? (permissions.find((p) => p.node === tool.required_permission)?.granted ?? false)
            : false

          let result: unknown
          if (!permitted) {
            result = { error: 'Permission denied' }
          } else if (toolBlock.name === 'propose_memory') {
            // Buffer for end-of-run write (partial-write guard).
            const input = toolBlock.input as Record<string, unknown>
            pendingProposals.push({
              id: crypto.randomUUID(),
              claim: String(input.claim ?? ''),
              suggested_type: (input.suggested_type as 'episodic' | 'semantic' | 'procedural') ?? 'episodic',
              sources: (input.sources as Record<string, unknown>) ?? {},
              confidence: Number(input.confidence ?? 0),
              entity_refs: (input.entity_refs as Record<string, unknown>) ?? {},
              acting_user_id: user.id,
              agent_id: agentConfigId,
              task_id: agentRunId,
              status: 'pending',
              reviewed_by: null,
              reviewed_at: null,
            })
            result = { status: 'queued' }
          } else if (toolBlock.name === 'search_memory') {
            if (retrievalContext) {
              const input = toolBlock.input as { query_text: string; namespaces?: string[] }
              const context: RetrievalContext = input.namespaces
                ? { ...retrievalContext, namespaces: input.namespaces }
                : retrievalContext
              const mems = await retrieveMemories({ queryText: input.query_text, context, serviceClient })
              result = {
                memories: mems.map((m) => ({
                  id: m.id,
                  content: m.content,
                  type: m.type,
                  source_refs: m.source_refs,
                  valid_from: m.valid_from,
                  sensitivity_level: m.sensitivity_level,
                })),
              }
            } else {
              result = { error: 'Retrieval context unavailable' }
            }
          } else if (toolBlock.name === 'fetch_gmail') {
            const input = toolBlock.input as { message_id: string }
            const { data: conn } = await serviceClient
              .from('connections')
              .select('id')
              .eq('owner_user_id', user.id)
              .eq('connector_type', 'gmail')
              .eq('status', 'active')
              .maybeSingle()
            if (!conn) {
              result = { error: 'No active Gmail connection' }
            } else {
              const { data: tokenJson, error: tokenErr } = await serviceClient.rpc(
                'get_decrypted_credential', { p_connection_id: conn.id }
              )
              if (tokenErr || !tokenJson) {
                result = { error: 'Could not retrieve Gmail credential' }
              } else {
                const token = JSON.parse(tokenJson as string) as { access_token: string }
                const resp = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${input.message_id}?format=full`,
                  { headers: { Authorization: `Bearer ${token.access_token}` } }
                )
                result = resp.ok ? await resp.json() : { error: `Gmail API error ${resp.status}` }
              }
            }
          } else if (toolBlock.name === 'fetch_drive_file') {
            const input = toolBlock.input as { file_id: string }
            const { data: conn } = await serviceClient
              .from('connections')
              .select('id')
              .eq('owner_user_id', user.id)
              .eq('connector_type', 'google_drive')
              .eq('status', 'active')
              .maybeSingle()
            if (!conn) {
              result = { error: 'No active Google Drive connection' }
            } else {
              const { data: tokenJson, error: tokenErr } = await serviceClient.rpc(
                'get_decrypted_credential', { p_connection_id: conn.id }
              )
              if (tokenErr || !tokenJson) {
                result = { error: 'Could not retrieve Drive credential' }
              } else {
                const token = JSON.parse(tokenJson as string) as { access_token: string }
                const authHeader = { Authorization: `Bearer ${token.access_token}` }
                // Fetch file metadata to determine MIME type
                const metaResp = await fetch(
                  `https://www.googleapis.com/drive/v3/files/${input.file_id}?fields=id,name,mimeType,size`,
                  { headers: authHeader }
                )
                if (!metaResp.ok) {
                  result = { error: `Drive API error ${metaResp.status}` }
                } else {
                  const meta = await metaResp.json() as { id: string; name: string; mimeType: string; size?: string }
                  const EXPORT_TYPES: Record<string, string> = {
                    'application/vnd.google-apps.document': 'text/plain',
                    'application/vnd.google-apps.spreadsheet': 'text/csv',
                    'application/vnd.google-apps.presentation': 'text/plain',
                  }
                  const exportMime = EXPORT_TYPES[meta.mimeType]
                  if (exportMime) {
                    const exportResp = await fetch(
                      `https://www.googleapis.com/drive/v3/files/${input.file_id}/export?mimeType=${encodeURIComponent(exportMime)}`,
                      { headers: authHeader }
                    )
                    result = exportResp.ok
                      ? { name: meta.name, mimeType: meta.mimeType, content: await exportResp.text() }
                      : { error: `Drive export error ${exportResp.status}` }
                  } else if (meta.mimeType.startsWith('text/')) {
                    const dlResp = await fetch(
                      `https://www.googleapis.com/drive/v3/files/${input.file_id}?alt=media`,
                      { headers: authHeader }
                    )
                    result = dlResp.ok
                      ? { name: meta.name, mimeType: meta.mimeType, content: await dlResp.text() }
                      : { error: `Drive download error ${dlResp.status}` }
                  } else {
                    result = {
                      name: meta.name,
                      mimeType: meta.mimeType,
                      size: meta.size,
                      message: 'Binary file — content not extractable. Use the file name and metadata only.',
                    }
                  }
                }
              }
            }
          } else if (toolBlock.name === 'search_drive') {
            const input = toolBlock.input as { query: string }
            const { data: conn } = await serviceClient
              .from('connections')
              .select('id')
              .eq('owner_user_id', user.id)
              .eq('connector_type', 'google_drive')
              .eq('status', 'active')
              .maybeSingle()
            if (!conn) {
              result = { error: 'No active Google Drive connection' }
            } else {
              const { data: tokenJson, error: tokenErr } = await serviceClient.rpc(
                'get_decrypted_credential', { p_connection_id: conn.id }
              )
              if (tokenErr || !tokenJson) {
                result = { error: 'Could not retrieve Drive credential' }
              } else {
                const token = JSON.parse(tokenJson as string) as { access_token: string }
                const qs = new URLSearchParams({
                  q: input.query,
                  fields: 'files(id,name,mimeType,modifiedTime,size)',
                  pageSize: '20',
                })
                const resp = await fetch(
                  `https://www.googleapis.com/drive/v3/files?${qs.toString()}`,
                  { headers: { Authorization: `Bearer ${token.access_token}` } }
                )
                result = resp.ok ? await resp.json() : { error: `Drive API error ${resp.status}` }
              }
            }
          } else {
            result = { error: 'Tool not implemented' }
          }

          toolCallsLog.push({
            tool_use_id: toolBlock.id,
            name: toolBlock.name,
            input: toolBlock.input,
            output: result,
            permitted,
          })

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          })
        }

        messages.push({ role: 'assistant', content: response.content })
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      // Unexpected stop reason — treat as end of conversation.
      finalOutput = extractTextContent(response.content)
      break
    }

    // 5. Build provenance labels.
    const provenanceLabels = buildProvenanceLabels(memoryContext, toolCallsLog)

    // 6. Commit pending proposals (only on success path — partial-write guard).
    if (pendingProposals.length > 0) {
      await serviceClient.from('memory_proposals').insert(pendingProposals)
    }

    const durationMs = Date.now() - startedAt
    const costUsd = calculateCost(model, totalInputTokens, totalOutputTokens)

    // 7. Update agent_run to completed.
    await serviceClient
      .from('agent_runs')
      .update({
        status: 'completed',
        output: finalOutput,
        tool_calls: toolCallsLog as unknown as Record<string, unknown>,
        memory_retrieved: { items: memoryContext.map((m) => m.id) } as Record<string, unknown>,
        provenance_labels: { labels: provenanceLabels } as Record<string, unknown>,
        tokens_used: totalInputTokens + totalOutputTokens,
        cost_usd: String(costUsd),
        duration_ms: durationMs,
      })
      .eq('id', agentRunId)

    // 8. Insert cost_event.
    await serviceClient.from('cost_events').insert({
      user_id: user.id,
      agent_run_id: agentRunId,
      job_run_id: jobRunId ?? null,
      event_type: triggerContext.type,
      tokens_input: totalInputTokens,
      tokens_output: totalOutputTokens,
      cost_usd: String(costUsd),
      model,
    })

    return {
      output: finalOutput,
      provenanceLabels,
      agentRunId,
      tokensUsed: totalInputTokens + totalOutputTokens,
      costUsd,
      status: 'completed',
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const durationMs = Date.now() - startedAt

    // Log failure to agent_run with whatever tool calls completed before the error.
    await serviceClient
      .from('agent_runs')
      .update({
        status: 'failed',
        output: null,
        tool_calls: toolCallsLog as unknown as Record<string, unknown>,
        duration_ms: durationMs,
        tokens_used: totalInputTokens + totalOutputTokens || null,
      })
      .eq('id', agentRunId)

    // Audit log failure entry.
    await serviceClient.from('audit_log').insert({
      action_type: 'agent_run_failed',
      actor_id: user.id,
      actor_type: actorType,
      target_type: 'agent_run',
      target_id: agentRunId,
      metadata: { error: errorMessage, agent_config_id: agentConfigId },
      ip_address: null,
    })

    if (triggerContext.type === 'user_query') {
      return {
        output: GRACEFUL_ERROR,
        provenanceLabels: [],
        agentRunId,
        tokensUsed: totalInputTokens + totalOutputTokens,
        costUsd: 0,
        status: 'failed',
        error: errorMessage,
      }
    }

    // Cron/webhook: rethrow so pg-boss can retry.
    throw err
  }
}

function buildUserMessage(triggerContext: TriggerContext, memoryContext: Memory[]): string {
  const parts: string[] = []

  if (memoryContext.length > 0) {
    parts.push('## Retrieved memories\n')
    for (const m of memoryContext) {
      parts.push(`- [${m.type}, ${m.sensitivity_level}] ${m.content} (source: memory/${m.id}, as of ${m.valid_from})`)
    }
    parts.push('')
  }

  if (triggerContext.query) {
    parts.push(triggerContext.query)
  } else if (triggerContext.type === 'cron') {
    parts.push(`Executing scheduled routine${triggerContext.routine_id ? ` (routine: ${triggerContext.routine_id})` : ''}.`)
  } else if (triggerContext.type === 'webhook') {
    parts.push(`Processing webhook event: ${triggerContext.webhook_event ?? 'unknown'}`)
  }

  return parts.join('\n')
}

function extractTextContent(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

function buildProvenanceLabels(memoryContext: Memory[], toolCallsLog: ToolCallLog[]): ProvenanceLabel[] {
  const labels: ProvenanceLabel[] = []

  for (const m of memoryContext) {
    labels.push({
      type: 'memory',
      source_ref: `memory/${m.id}`,
      as_of: m.valid_from,
    })
  }

  const liveToolNames = new Set(['fetch_gmail', 'fetch_drive_file', 'search_drive'])
  for (const call of toolCallsLog) {
    if (call.permitted && liveToolNames.has(call.name)) {
      labels.push({ type: 'live', source_ref: call.name })
    }
  }

  if (labels.length === 0) {
    labels.push({ type: 'inference' })
  }

  return labels
}
