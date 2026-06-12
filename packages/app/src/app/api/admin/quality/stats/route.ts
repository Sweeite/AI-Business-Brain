import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

type AgentRunRow = {
  created_at: string
  user_rating: number | null
}

type MissLogRow = {
  created_at: string
  reason: string
}

type MemoryRow = {
  retrieval_count: number | null
  utility_score: number | null
}

type ConfigRow = {
  key: string
  value: unknown
}

function toDay(iso: string): string {
  return iso.slice(0, 10)
}

function startOf(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function GET(req: NextRequest) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const { searchParams } = req.nextUrl
  const period = Math.min(90, Math.max(7, parseInt(searchParams.get('period') ?? '30', 10)))
  const cutoff = startOf(period)
  const prior7Start = startOf(14)
  const recent7Start = startOf(7)

  const [
    agentRunsRes,
    missLogRes,
    memoriesRes,
    configRes,
    agentRunsPrior7Res,
    missLogPrior7Res,
  ] = await Promise.all([
    serviceClient
      .from('agent_runs')
      .select('created_at, user_rating')
      .eq('trigger_context->>type', 'user_query')
      .gte('created_at', cutoff)
      .limit(10000),

    serviceClient
      .from('miss_log')
      .select('created_at, reason')
      .gte('created_at', cutoff)
      .limit(10000),

    serviceClient
      .from('memories')
      .select('retrieval_count, utility_score')
      .eq('status', 'active')
      .limit(50000),

    serviceClient
      .from('system_config')
      .select('key, value')
      .in('key', [
        'quality_abstention_drop_threshold_pct',
        'quality_low_rating_alert_pct',
        'quality_miss_daily_alert_count',
        'quality_unused_memory_alert_pct',
      ]),

    // Prior 7 days (days 8–14 ago) for abstention drop detection
    serviceClient
      .from('agent_runs')
      .select('created_at')
      .eq('trigger_context->>type', 'user_query')
      .gte('created_at', prior7Start)
      .lt('created_at', recent7Start)
      .limit(5000),

    serviceClient
      .from('miss_log')
      .select('created_at')
      .gte('created_at', prior7Start)
      .lt('created_at', recent7Start)
      .limit(5000),
  ])

  if (agentRunsRes.error) return NextResponse.json({ error: agentRunsRes.error.message }, { status: 500 })
  if (missLogRes.error) return NextResponse.json({ error: missLogRes.error.message }, { status: 500 })

  const agentRuns = (agentRunsRes.data ?? []) as AgentRunRow[]
  const missLog = (missLogRes.data ?? []) as MissLogRow[]
  const memories = (memoriesRes.data ?? []) as MemoryRow[]

  const configRows = (configRes.data ?? []) as ConfigRow[]
  const configMap = new Map(configRows.map((r) => [r.key, r.value]))

  const thresholds = {
    abstentionDropPct: (configMap.get('quality_abstention_drop_threshold_pct') as number) ?? 20,
    lowRatingPct: (configMap.get('quality_low_rating_alert_pct') as number) ?? 30,
    missDailyCount: (configMap.get('quality_miss_daily_alert_count') as number) ?? 10,
    unusedMemoryPct: (configMap.get('quality_unused_memory_alert_pct') as number) ?? 70,
  }

  // ── By-day maps ──────────────────────────────────────────────────────────────

  // Total user queries per day
  const queryByDay = new Map<string, number>()
  // Rated runs per day
  const ratedByDay = new Map<string, number>()
  const lowRatedByDay = new Map<string, number>()

  for (const run of agentRuns) {
    const day = toDay(run.created_at)
    queryByDay.set(day, (queryByDay.get(day) ?? 0) + 1)
    if (run.user_rating !== null) {
      ratedByDay.set(day, (ratedByDay.get(day) ?? 0) + 1)
      if (run.user_rating === -1) {
        lowRatedByDay.set(day, (lowRatedByDay.get(day) ?? 0) + 1)
      }
    }
  }

  // Miss log per day
  const missByDayMap = new Map<string, number>()
  for (const miss of missLog) {
    const day = toDay(miss.created_at)
    missByDayMap.set(day, (missByDayMap.get(day) ?? 0) + 1)
  }

  // ── Build ordered day arrays ──────────────────────────────────────────────────
  const abstentionByDay = []
  const missByDay = []
  const lowRatingByDay = []

  for (let i = period - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const day = toDay(d.toISOString())

    const totalQueries = queryByDay.get(day) ?? 0
    const misses = missByDayMap.get(day) ?? 0
    const abstentionPct = totalQueries > 0 ? Math.round((misses / totalQueries) * 1000) / 10 : 0

    abstentionByDay.push({ day, totalQueries, misses, abstentionPct })
    missByDay.push({ day, count: misses })

    const rated = ratedByDay.get(day) ?? 0
    const lowRated = lowRatedByDay.get(day) ?? 0
    const lowRatingPct = rated > 0 ? Math.round((lowRated / rated) * 1000) / 10 : 0
    lowRatingByDay.push({ day, rated, lowRated, lowRatingPct })
  }

  // ── Memory utility distribution ───────────────────────────────────────────────
  let retrieved = 0
  let unused = 0
  let sumUtilityRetrieved = 0
  let countUtilityRetrieved = 0
  let sumUtilityUnused = 0
  let countUtilityUnused = 0

  for (const mem of memories) {
    const rc = mem.retrieval_count ?? 0
    if (rc > 0) {
      retrieved++
      if (mem.utility_score !== null) {
        sumUtilityRetrieved += mem.utility_score
        countUtilityRetrieved++
      }
    } else {
      unused++
      if (mem.utility_score !== null) {
        sumUtilityUnused += mem.utility_score
        countUtilityUnused++
      }
    }
  }

  const totalActive = retrieved + unused
  const pctRetrieved = totalActive > 0 ? Math.round((retrieved / totalActive) * 1000) / 10 : 0
  const pctUnused = totalActive > 0 ? Math.round((unused / totalActive) * 1000) / 10 : 0
  const avgUtilityRetrieved = countUtilityRetrieved > 0
    ? Math.round((sumUtilityRetrieved / countUtilityRetrieved) * 1000) / 1000
    : null
  const avgUtilityUnused = countUtilityUnused > 0
    ? Math.round((sumUtilityUnused / countUtilityUnused) * 1000) / 1000
    : null

  const utilityDistribution = {
    totalActive,
    retrieved,
    unused,
    pctRetrieved,
    pctUnused,
    avgUtilityRetrieved,
    avgUtilityUnused,
  }

  // ── Current period summary stats ──────────────────────────────────────────────
  const daysWithQueries = abstentionByDay.filter((d) => d.totalQueries > 0)
  const avgAbstentionPct = daysWithQueries.length > 0
    ? Math.round(daysWithQueries.reduce((s, d) => s + d.abstentionPct, 0) / daysWithQueries.length * 10) / 10
    : 0

  const daysWithRatings = lowRatingByDay.filter((d) => d.rated > 0)
  const avgLowRatingPct = daysWithRatings.length > 0
    ? Math.round(daysWithRatings.reduce((s, d) => s + d.lowRatingPct, 0) / daysWithRatings.length * 10) / 10
    : 0

  const totalMisses = missLog.length

  const currentPeriodStats = {
    avgAbstentionPct,
    avgLowRatingPct,
    totalMisses,
    unusedMemoryPct: pctUnused,
  }

  // ── Abstention drop detection (last 7 vs prior 7) ─────────────────────────────
  const prior7Queries = (agentRunsPrior7Res.data ?? []).length
  const prior7Misses = (missLogPrior7Res.data ?? []).length
  const prior7AbstentionPct = prior7Queries > 0 ? (prior7Misses / prior7Queries) * 100 : 0

  const recent7Days = abstentionByDay.slice(-7)
  const recent7QueriesTotal = recent7Days.reduce((s, d) => s + d.totalQueries, 0)
  const recent7MissesTotal = recent7Days.reduce((s, d) => s + d.misses, 0)
  const recent7AbstentionPct = recent7QueriesTotal > 0
    ? (recent7MissesTotal / recent7QueriesTotal) * 100
    : 0

  // ── Alerts ────────────────────────────────────────────────────────────────────
  const alerts: { key: string; message: string; severity: 'warning' | 'critical' }[] = []

  // Abstention drop: alert if rate fell by more than threshold% relative to prior week
  if (prior7AbstentionPct > 0) {
    const dropPct = ((prior7AbstentionPct - recent7AbstentionPct) / prior7AbstentionPct) * 100
    if (dropPct >= thresholds.abstentionDropPct) {
      alerts.push({
        key: 'abstention_drop',
        message: `Abstention rate dropped ${Math.round(dropPct)}% vs. prior week (${Math.round(recent7AbstentionPct * 10) / 10}% now vs. ${Math.round(prior7AbstentionPct * 10) / 10}% prior). The brain may be confabulating instead of abstaining.`,
        severity: 'critical',
      })
    }
  }

  // Low-rating alert
  if (avgLowRatingPct > thresholds.lowRatingPct) {
    alerts.push({
      key: 'low_rating',
      message: `${avgLowRatingPct}% of rated answers in this period received negative ratings (threshold: ${thresholds.lowRatingPct}%).`,
      severity: 'warning',
    })
  }

  // Miss daily alert
  const maxDailyMisses = Math.max(0, ...missByDay.map((d) => d.count))
  if (maxDailyMisses > thresholds.missDailyCount) {
    alerts.push({
      key: 'miss_rate',
      message: `Daily miss count peaked at ${maxDailyMisses} (threshold: ${thresholds.missDailyCount} per day).`,
      severity: 'warning',
    })
  }

  // Unused memory alert
  if (pctUnused > thresholds.unusedMemoryPct) {
    alerts.push({
      key: 'unused_memory',
      message: `${pctUnused}% of active memories have never been retrieved (threshold: ${thresholds.unusedMemoryPct}%). Memory store may be accumulating irrelevant content.`,
      severity: 'warning',
    })
  }

  return NextResponse.json({
    abstentionByDay,
    missByDay,
    lowRatingByDay,
    utilityDistribution,
    alerts,
    thresholds,
    currentPeriodStats,
  })
}
