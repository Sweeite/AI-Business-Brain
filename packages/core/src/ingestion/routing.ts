import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '../supabase/client.js'
import type { MemoryType } from '../schemas/index.js'
import { generateEmbedding, EMBEDDING_MODEL } from '../memory/embed.js'
import { calculateCost } from '../agent/cost.js'
import { chunkText } from './chunking.js'

export interface ExclusionRule {
  type: 'email' | 'domain'
  value: string
}

export interface ClassifierConfig {
  id: string
  model: string
  system_prompt: string
}

interface Gate3Result {
  decision: 'memory' | 'index' | 'drop'
  confidence: number
  suggested_type: MemoryType
  rationale: string
}

export interface RoutingResult {
  outcome: 'dropped' | 'indexed' | 'memory_proposed'
  chunksWritten: number
}

function isExcluded(senderEmail: string, rules: ExclusionRule[]): boolean {
  const lower = senderEmail.toLowerCase()
  const domain = lower.split('@')[1] ?? ''
  return rules.some(r => {
    if (r.type === 'email') return r.value.toLowerCase() === lower
    if (r.type === 'domain') return r.value.toLowerCase() === domain
    return false
  })
}

async function runGate3(
  content: string,
  config: ClassifierConfig,
  jobRunId: string,
  ownerUserId: string,
  serviceClient: SupabaseClient,
): Promise<Gate3Result> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const msg = await anthropic.messages.create({
    model: config.model,
    max_tokens: 256,
    system: config.system_prompt,
    messages: [{ role: 'user', content }],
  })

  const responseText = (msg.content as Array<{ type: string; text?: string }>)
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('')

  await serviceClient.from('cost_events').insert({
    event_type: 'ingestion_gate3',
    job_run_id: jobRunId,
    model: config.model,
    tokens_input: msg.usage.input_tokens,
    tokens_output: msg.usage.output_tokens,
    cost_usd: String(calculateCost(config.model, msg.usage.input_tokens, msg.usage.output_tokens)),
    user_id: ownerUserId,
    agent_run_id: null,
  })

  try {
    return JSON.parse(responseText) as Gate3Result
  } catch {
    return { decision: 'index', confidence: 0.5, suggested_type: 'episodic', rationale: 'parse_failed' }
  }
}

export async function runRoutingPipeline(params: {
  content: string
  senderEmail: string
  connectorType: string
  ownerUserId: string
  jobRunId: string
  sourceRef: Record<string, unknown>
  exclusionRules: ExclusionRule[]
  docClassifierConfig: ClassifierConfig
  chunkClassifierConfig: ClassifierConfig
  serviceClient: SupabaseClient
}): Promise<RoutingResult> {
  const {
    content, senderEmail, connectorType, ownerUserId, jobRunId,
    sourceRef, exclusionRules, docClassifierConfig, chunkClassifierConfig,
    serviceClient,
  } = params

  // ── Gate 1: exclusion check ───────────────────────────────────────────────
  if (isExcluded(senderEmail, exclusionRules)) {
    return { outcome: 'dropped', chunksWritten: 0 }
  }

  // ── Gate 2: skip for unstructured connectors (Gmail, Drive) ──────────────
  // connector_schema is empty for Gmail — all content is treated as interpretive.

  // ── Gate 3 doc-level ──────────────────────────────────────────────────────
  const docResult = await runGate3(content, docClassifierConfig, jobRunId, ownerUserId, serviceClient)

  if (docResult.decision === 'drop') {
    return { outcome: 'dropped', chunksWritten: 0 }
  }

  const chunks = chunkText(content)

  if (docResult.decision === 'index') {
    // INDEX-IN-PLACE: chunk + embed + write to chunks table
    let written = 0
    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk)
      const { error } = await serviceClient.from('chunks').insert({
        connector_type: connectorType,
        content: chunk,
        embedding: embedding as unknown as string,
        embedding_model: EMBEDDING_MODEL,
        owner_user_id: ownerUserId,
        source_ref: sourceRef,
      })
      if (!error) written++
    }
    return { outcome: 'indexed', chunksWritten: written }
  }

  // decision === 'memory': Gate 3 per-chunk then propose_memory
  // ── Gate 4 stub ────────────────────────────────────────────────────────────
  // When structured connectors exist, check here for action items with owner+date.
  // For now: always NO → write to memory (no SoR write needed).

  let proposed = 0
  for (const chunk of chunks) {
    const chunkResult = await runGate3(chunk, chunkClassifierConfig, jobRunId, ownerUserId, serviceClient)

    if (chunkResult.decision !== 'memory') continue

    const { error } = await serviceClient.from('memory_proposals').insert({
      id: crypto.randomUUID(),
      claim: chunk,
      suggested_type: chunkResult.suggested_type,
      sources: { connector: connectorType, source_ref: sourceRef },
      confidence: chunkResult.confidence,
      entity_refs: {},
      acting_user_id: ownerUserId,
      agent_id: chunkClassifierConfig.id,
      task_id: jobRunId,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
    })

    if (!error) proposed++
  }

  return { outcome: 'memory_proposed', chunksWritten: proposed }
}
