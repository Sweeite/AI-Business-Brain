import type PgBoss from 'pg-boss'
import { invalidateMemory, SYSTEM_USER_ID } from '@brain/core'
import type { SupabaseClient } from '@brain/core'

const BATCH_SIZE = 100
const MS_PER_DAY = 1000 * 60 * 60 * 24

export function createMemoryDecayHandler(supabase: SupabaseClient) {
  return async (_job: PgBoss.Job): Promise<void> => {
    // 1. Read decay config from system_config
    const { data: configRows } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['decay_min_utility_score', 'decay_min_age_days', 'chunk_ttl_days'])

    const configMap: Record<string, unknown> = {}
    for (const row of configRows ?? []) {
      configMap[row.key] = row.value
    }

    const minUtilityScore =
      typeof configMap['decay_min_utility_score'] === 'number'
        ? configMap['decay_min_utility_score']
        : 0.2

    const minAgeDays =
      typeof configMap['decay_min_age_days'] === 'number'
        ? configMap['decay_min_age_days']
        : 30

    const chunkTtlDays =
      typeof configMap['chunk_ttl_days'] === 'number'
        ? configMap['chunk_ttl_days']
        : 90

    const now = new Date()
    const ageCutoff = new Date(now.getTime() - minAgeDays * MS_PER_DAY).toISOString()

    console.log(`[memory-decay] config: minUtilityScore=${minUtilityScore}, minAgeDays=${minAgeDays}, chunkTtlDays=${chunkTtlDays}`)

    let scoresUpdated = 0
    let memoriesInvalidated = 0
    let offset = 0

    // 2. Process eligible memories in batches
    while (true) {
      const { data: memories, error: fetchError } = await supabase
        .from('memories')
        .select('id, retrieval_count, last_retrieved_at, created_at')
        .eq('status', 'active')
        .lt('created_at', ageCutoff)
        .order('created_at', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1)

      if (fetchError) {
        throw new Error(`[memory-decay] failed to fetch memories: ${fetchError.message}`)
      }

      if (!memories || memories.length === 0) break

      const memoryIds = memories.map((m) => m.id)

      // 3. Fetch all feedback for this batch in one query
      const { data: feedbackRows } = await supabase
        .from('memory_feedback')
        .select('memory_id, rating')
        .in('memory_id', memoryIds)

      const feedbackByMemory = new Map<string, { positive: number; negative: number; total: number }>()
      for (const row of feedbackRows ?? []) {
        const existing = feedbackByMemory.get(row.memory_id) ?? { positive: 0, negative: 0, total: 0 }
        existing.total += 1
        if (row.rating === 1) existing.positive += 1
        else if (row.rating === -1) existing.negative += 1
        feedbackByMemory.set(row.memory_id, existing)
      }

      // 4. Compute utility score and process each memory
      for (const memory of memories) {
        const retrieval_count = memory.retrieval_count ?? 0
        const last_retrieved_at = memory.last_retrieved_at as string | null

        // retrieval_recency_score: exp(-daysSince / 90), 0 if never retrieved
        const recency = last_retrieved_at
          ? Math.exp(-((now.getTime() - new Date(last_retrieved_at).getTime()) / MS_PER_DAY) / 90)
          : 0

        // retrieval_frequency_score: min(1.0, log(count + 1) / log(50))
        const frequency = Math.min(1.0, Math.log(retrieval_count + 1) / Math.log(50))

        // feedback_score: (pos - neg) / max(total, 1), clamped -1..1, mapped 0..1
        const fb = feedbackByMemory.get(memory.id) ?? { positive: 0, negative: 0, total: 0 }
        const feedbackRaw = Math.max(-1, Math.min(1, (fb.positive - fb.negative) / Math.max(fb.total, 1)))
        const feedback = (feedbackRaw + 1) / 2

        const utilityScore = recency * 0.4 + frequency * 0.3 + feedback * 0.3

        // 5. Update utility_score
        const { error: updateError } = await supabase
          .from('memories')
          .update({ utility_score: utilityScore })
          .eq('id', memory.id)

        if (updateError) {
          console.error(`[memory-decay] failed to update utility_score for ${memory.id}: ${updateError.message}`)
          continue
        }

        scoresUpdated += 1

        // 6. Invalidate if below threshold
        if (utilityScore < minUtilityScore) {
          await invalidateMemory({ id: memory.id, serviceClient: supabase })

          await supabase.from('audit_log').insert({
            id: crypto.randomUUID(),
            action_type: 'memory_invalidated',
            actor_id: SYSTEM_USER_ID,
            actor_type: 'system',
            target_type: 'memory',
            target_id: memory.id,
            metadata: { reason: 'decay', utility_score: utilityScore },
          })

          memoriesInvalidated += 1
        }
      }

      if (memories.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }

    // 7. Prune chunks older than chunk_ttl_days
    const chunkCutoff = new Date(now.getTime() - chunkTtlDays * MS_PER_DAY).toISOString()
    const { error: pruneError, count: chunksDeleted } = await supabase
      .from('chunks')
      .delete({ count: 'exact' })
      .lt('created_at', chunkCutoff)

    if (pruneError) {
      console.error(`[memory-decay] failed to prune chunks: ${pruneError.message}`)
    }

    console.log(
      `[memory-decay] complete — scores updated: ${scoresUpdated}, invalidated: ${memoriesInvalidated}, chunks pruned: ${chunksDeleted ?? 0}`,
    )
  }
}
