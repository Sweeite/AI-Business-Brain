import type PgBoss from 'pg-boss'
import { executeAgent, SYSTEM_USER_ID } from '@brain/core'
import type { SupabaseClient } from '@brain/core'

const IMPROVEMENT_AGENT_NAME = 'system.memory.improvement_analysis'

interface SignalData {
  period_days: number
  agent_runs: {
    total: number
    rated: number
    avg_rating: number | null
    low_rated: number
    high_rated: number
  }
  memory_feedback: {
    helpful: number
    wrong: number
    stale: number
    stop_storing: number
  }
  miss_log: {
    unresolved_count: number
    sample_queries: string[]
  }
  recent_memories_written: number
  last_suggestion_at: string | null
}

interface RawSuggestion {
  category: string
  title: string
  reasoning: string
  proposed_change: Record<string, unknown>
  target_config_id: string | null
  evidence: Record<string, unknown> | null
}

export function createImprovementAnalysisHandler(supabase: SupabaseClient) {
  return async (_job: PgBoss.Job): Promise<void> => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // --- Gather signals ---

    const [runsResult, feedbackResult, missResult, memoriesResult, lastSuggestionResult] =
      await Promise.all([
        supabase
          .from('agent_runs')
          .select('user_rating')
          .gte('created_at', sevenDaysAgo),
        supabase
          .from('memory_feedback')
          .select('feedback_type')
          .gte('created_at', sevenDaysAgo),
        supabase
          .from('miss_log')
          .select('query')
          .eq('resolved', false)
          .gte('created_at', sevenDaysAgo)
          .limit(10),
        supabase
          .from('memories')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo),
        supabase
          .from('improvement_suggestions')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1),
      ])

    const runs = (runsResult.data ?? []) as { user_rating: number | null }[]
    const ratedRuns = runs.filter((r) => r.user_rating !== null)
    const avgRating = ratedRuns.length > 0
      ? ratedRuns.reduce((sum, r) => sum + (r.user_rating ?? 0), 0) / ratedRuns.length
      : null

    const feedbackRows = (feedbackResult.data ?? []) as { feedback_type: string }[]
    const feedbackCounts = { helpful: 0, wrong: 0, stale: 0, stop_storing: 0 }
    for (const row of feedbackRows) {
      const t = row.feedback_type as keyof typeof feedbackCounts
      if (t in feedbackCounts) feedbackCounts[t]++
    }

    const missRows = (missResult.data ?? []) as { query: string }[]

    const signals: SignalData = {
      period_days: 7,
      agent_runs: {
        total: runs.length,
        rated: ratedRuns.length,
        avg_rating: avgRating !== null ? Math.round(avgRating * 100) / 100 : null,
        low_rated: ratedRuns.filter((r) => r.user_rating === -1).length,
        high_rated: ratedRuns.filter((r) => r.user_rating === 1).length,
      },
      memory_feedback: feedbackCounts,
      miss_log: {
        unresolved_count: missRows.length,
        sample_queries: missRows.map((r) => r.query).slice(0, 10),
      },
      recent_memories_written: memoriesResult.count ?? 0,
      last_suggestion_at: lastSuggestionResult.data?.[0]?.created_at ?? null,
    }

    // --- Load improvement analysis agent config ---
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('id, system_prompt, model, tool_ids')
      .eq('name', IMPROVEMENT_AGENT_NAME)
      .eq('is_active', true)
      .single()

    if (!agentConfig) {
      console.error('[improvement-analysis] agent config not found or inactive')
      return
    }

    const systemUser = {
      id: SYSTEM_USER_ID,
      email: 'system@internal',
      full_name: 'System',
      role_id: '10000000-0000-0000-0000-000000000001',
      created_at: new Date().toISOString(),
      last_seen_at: null,
      is_active: false,
    }

    // --- Run analysis via executeAgent ---
    const result = await executeAgent({
      user: systemUser,
      agentConfigId: agentConfig.id,
      model: agentConfig.model,
      systemPrompt: agentConfig.system_prompt,
      tools: [],
      memoryContext: [],
      triggerContext: {
        type: 'cron',
        query: JSON.stringify(signals, null, 2),
      },
      permissions: [],
      serviceClient: supabase,
    })

    if (result.status !== 'completed' || !result.output) {
      console.error('[improvement-analysis] agent run failed:', result.error)
      return
    }

    // --- Parse suggestions from agent output ---
    let suggestions: RawSuggestion[] = []
    try {
      const jsonMatch = result.output.match(/```json\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : result.output.trim()
      const parsed = JSON.parse(jsonStr)
      if (Array.isArray(parsed)) {
        suggestions = parsed as RawSuggestion[]
      }
    } catch {
      console.warn('[improvement-analysis] could not parse suggestions from output')
      return
    }

    if (suggestions.length === 0) {
      console.log('[improvement-analysis] no suggestions generated this run')
    } else {
      const rows = suggestions.map((s) => ({
        id: crypto.randomUUID(),
        category: s.category,
        title: s.title,
        reasoning: s.reasoning,
        proposed_change: s.proposed_change as Record<string, unknown>,
        target_config_id: s.target_config_id ?? null,
        evidence: s.evidence ?? null,
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
      }))

      const { error: insertError } = await supabase
        .from('improvement_suggestions')
        .insert(rows)

      if (insertError) {
        console.error('[improvement-analysis] failed to insert suggestions:', insertError.message)
      } else {
        console.log(`[improvement-analysis] inserted ${rows.length} suggestion(s)`)
      }
    }

    // --- Mark old unresolved misses as resolved if new memories were written ---
    // Simple heuristic: if any memories were written this week, mark misses older than 14 days resolved.
    if (signals.recent_memories_written > 0) {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      await supabase
        .from('miss_log')
        .update({ resolved: true })
        .eq('resolved', false)
        .lt('created_at', fourteenDaysAgo)
    }
  }
}
