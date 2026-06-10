import type PgBoss from 'pg-boss'
import {
  executeAgent,
  SYSTEM_USER_ID,
  writeMemory,
  generateEmbedding,
} from '@brain/core'
import type { SupabaseClient } from '@brain/core'

const CONSOLIDATION_AGENT_NAME = 'system.memory.consolidation'
const BATCH_SIZE = 50

type SensitivityLevel = 'public' | 'internal' | 'management' | 'leadership'
const VALID_SENSITIVITY: SensitivityLevel[] = ['public', 'internal', 'management', 'leadership']

interface SemanticFact {
  content: string
  namespace: string
  sensitivity_level: string
  source_memory_ids: string[]
}

const SYSTEM_USER = {
  id: SYSTEM_USER_ID,
  email: 'system@internal',
  full_name: 'System',
  role_id: '10000000-0000-0000-0000-000000000001',
  created_at: new Date().toISOString(),
  last_seen_at: null,
  is_active: false,
}

export function createMemoryConsolidationHandler(supabase: SupabaseClient) {
  return async (_job: PgBoss.Job): Promise<void> => {
    // 1. Read config from system_config
    const { data: configRows } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['consolidation_last_run_at', 'consolidation_dedup_similarity_threshold'])

    const configMap: Record<string, unknown> = {}
    for (const row of configRows ?? []) {
      configMap[row.key] = row.value
    }

    const lastRunAt =
      typeof configMap['consolidation_last_run_at'] === 'string'
        ? configMap['consolidation_last_run_at']
        : null
    const dedupThreshold =
      typeof configMap['consolidation_dedup_similarity_threshold'] === 'number'
        ? configMap['consolidation_dedup_similarity_threshold']
        : 0.92

    // 2. Fetch episodic memories created after the watermark
    let query = supabase
      .from('memories')
      .select('id, content, namespace, sensitivity_level, source_refs, created_at')
      .eq('type', 'episodic')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (lastRunAt) {
      query = query.gt('created_at', lastRunAt)
    }

    const { data: episodicMemories, error: fetchError } = await query

    if (fetchError) {
      throw new Error(`[memory-consolidation] failed to fetch episodic memories: ${fetchError.message}`)
    }

    // 3. Nothing new — advance watermark and return
    if (!episodicMemories || episodicMemories.length === 0) {
      await updateWatermark(supabase)
      console.log('[memory-consolidation] no new episodic memories to consolidate')
      return
    }

    console.log(`[memory-consolidation] consolidating ${episodicMemories.length} episodic memory(ies)`)

    // 4. Load consolidation agent config
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('id, system_prompt, model, tool_ids')
      .eq('name', CONSOLIDATION_AGENT_NAME)
      .eq('is_active', true)
      .single()

    if (!agentConfig) {
      throw new Error('[memory-consolidation] agent config not found or inactive')
    }

    // 5. Run consolidation via executeAgent
    const result = await executeAgent({
      user: SYSTEM_USER,
      agentConfigId: agentConfig.id,
      model: agentConfig.model,
      systemPrompt: agentConfig.system_prompt,
      tools: [],
      memoryContext: [],
      triggerContext: {
        type: 'cron',
        query: JSON.stringify(episodicMemories, null, 2),
      },
      permissions: [],
      serviceClient: supabase,
    })

    if (result.status !== 'completed' || !result.output) {
      throw new Error(`[memory-consolidation] agent run failed: ${result.error ?? 'no output'}`)
    }

    // 6. Parse semantic facts from agent output
    let facts: SemanticFact[] = []
    try {
      const jsonMatch = result.output.match(/```json\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : result.output.trim()
      const parsed = JSON.parse(jsonStr)
      if (Array.isArray(parsed)) {
        facts = parsed as SemanticFact[]
      }
    } catch {
      throw new Error('[memory-consolidation] could not parse semantic facts from agent output')
    }

    console.log(`[memory-consolidation] agent proposed ${facts.length} semantic fact(s)`)

    // 7. Process each semantic fact
    for (const fact of facts) {
      if (!fact.content?.trim() || !fact.namespace) {
        console.warn('[memory-consolidation] skipping malformed fact (missing content or namespace)')
        continue
      }

      const sensitivityLevel: SensitivityLevel = VALID_SENSITIVITY.includes(
        fact.sensitivity_level as SensitivityLevel,
      )
        ? (fact.sensitivity_level as SensitivityLevel)
        : 'internal'

      // Generate embedding for near-duplicate check
      const embedding = await generateEmbedding(fact.content)

      // Check for near-duplicate among existing active semantic memories in same namespace
      const { data: nearestRows } = await supabase.rpc('find_nearest_semantic_memory', {
        p_embedding: embedding as unknown as string,
        p_namespace: fact.namespace,
      })

      const nearest = (nearestRows as Array<{ memory_id: string; similarity: number }> | null)?.[0]

      if (nearest && nearest.similarity >= dedupThreshold) {
        // Route to human review queue — too similar to an existing semantic memory
        const { error: proposalError } = await supabase.from('memory_proposals').insert({
          id: crypto.randomUUID(),
          claim: fact.content,
          suggested_type: 'semantic',
          sources: {
            episodic_memory_ids: fact.source_memory_ids ?? [],
            near_duplicate_memory_id: nearest.memory_id,
            similarity_score: nearest.similarity,
          },
          confidence: 1.0,
          entity_refs: {},
          acting_user_id: SYSTEM_USER_ID,
          agent_id: agentConfig.id,
          task_id: result.agentRunId,
          status: 'pending_review',
          reviewed_by: null,
          reviewed_at: null,
        })

        if (proposalError) {
          console.error('[memory-consolidation] failed to insert review proposal:', proposalError.message)
        } else {
          console.log(
            `[memory-consolidation] near-duplicate (similarity=${nearest.similarity.toFixed(3)}) → review queue`,
          )
        }
      } else {
        // Commit the semantic fact — writeMemory handles content_hash dedup
        const { skipped } = await writeMemory({
          type: 'semantic',
          content: fact.content,
          sourceRefs: { episodic_memory_ids: fact.source_memory_ids ?? [] },
          authorType: 'agent',
          authorId: SYSTEM_USER_ID,
          agentTaskId: result.agentRunId,
          sensitivityLevel,
          namespace: fact.namespace,
          serviceClient: supabase,
        })

        if (!skipped) {
          console.log('[memory-consolidation] committed semantic fact')
        }
      }
    }

    // 8. Update watermark — only on full success
    await updateWatermark(supabase)
    console.log('[memory-consolidation] complete — watermark advanced')
  }
}

async function updateWatermark(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from('system_config')
    .update({ value: new Date().toISOString(), updated_by: SYSTEM_USER_ID })
    .eq('key', 'consolidation_last_run_at')

  if (error) {
    console.error('[memory-consolidation] failed to update watermark:', error.message)
  }
}
