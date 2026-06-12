import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

type CostEventRow = {
  user_id: string | null
  agent_run_id: string | null
  event_type: string
  tokens_input: number | null
  tokens_output: number | null
  cost_usd: number | null
  model: string | null
  created_at: string
}

type AgentRunRow = {
  tool_calls: Array<{ name?: string; type?: string }> | null
}

type UserRow = {
  id: string
  email: string
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

  const [
    costEventsRes,
    usersRes,
    agentRunsRes,
    memoriesCountRes,
    proposalsCountRes,
    chunksCountRes,
    configRes,
  ] = await Promise.all([
    serviceClient
      .from('cost_events')
      .select('user_id, agent_run_id, event_type, tokens_input, tokens_output, cost_usd, model, created_at')
      .gte('created_at', cutoff)
      .limit(10000),

    serviceClient
      .from('users')
      .select('id, email')
      .limit(500),

    serviceClient
      .from('agent_runs')
      .select('tool_calls')
      .gte('created_at', cutoff)
      .not('tool_calls', 'is', null)
      .limit(500),

    serviceClient
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),

    serviceClient
      .from('memory_proposals')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'pending_review']),

    serviceClient
      .from('chunks')
      .select('id', { count: 'exact', head: true }),

    serviceClient
      .from('system_config')
      .select('key, value')
      .in('key', ['cost_budget_usd', 'cost_alert_threshold_pct']),
  ])

  if (costEventsRes.error) return NextResponse.json({ error: costEventsRes.error.message }, { status: 500 })

  const events = (costEventsRes.data ?? []) as CostEventRow[]
  const users = (usersRes.data ?? []) as UserRow[]
  const userMap = new Map(users.map((u) => [u.id, u.email]))

  // Aggregate by day
  const dayMap = new Map<string, number>()
  // Aggregate by user
  const userCostMap = new Map<string, { cost: number; tokensIn: number; tokensOut: number }>()
  // Aggregate by event_type
  const eventTypeMap = new Map<string, number>()
  // Aggregate by model
  const modelMap = new Map<string, number>()

  let totalCost = 0
  let totalTokensIn = 0
  let totalTokensOut = 0

  for (const ev of events) {
    const cost = ev.cost_usd ?? 0
    const tIn = ev.tokens_input ?? 0
    const tOut = ev.tokens_output ?? 0
    totalCost += cost
    totalTokensIn += tIn
    totalTokensOut += tOut

    // by day
    const day = toDay(ev.created_at)
    dayMap.set(day, (dayMap.get(day) ?? 0) + cost)

    // by user
    const uid = ev.user_id ?? 'system'
    const existing = userCostMap.get(uid) ?? { cost: 0, tokensIn: 0, tokensOut: 0 }
    userCostMap.set(uid, { cost: existing.cost + cost, tokensIn: existing.tokensIn + tIn, tokensOut: existing.tokensOut + tOut })

    // by event_type
    eventTypeMap.set(ev.event_type, (eventTypeMap.get(ev.event_type) ?? 0) + cost)

    // by model
    const model = ev.model ?? 'unknown'
    modelMap.set(model, (modelMap.get(model) ?? 0) + cost)
  }

  // Spend by day — last period days, sorted ascending
  const spendByDay: { day: string; cost_usd: number }[] = []
  for (let i = period - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const day = toDay(d.toISOString())
    spendByDay.push({ day, cost_usd: Math.round((dayMap.get(day) ?? 0) * 10000) / 10000 })
  }

  // Per-user cost, sorted by cost desc
  const spendByUser = Array.from(userCostMap.entries())
    .map(([userId, data]) => ({
      userId,
      email: userId === 'system' ? 'System' : (userMap.get(userId) ?? userId),
      cost_usd: Math.round(data.cost * 10000) / 10000,
      tokensIn: data.tokensIn,
      tokensOut: data.tokensOut,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd)

  const spendByEventType = Array.from(eventTypeMap.entries())
    .map(([eventType, cost_usd]) => ({ eventType, cost_usd: Math.round(cost_usd * 10000) / 10000 }))
    .sort((a, b) => b.cost_usd - a.cost_usd)

  const spendByModel = Array.from(modelMap.entries())
    .map(([model, cost_usd]) => ({ model, cost_usd: Math.round(cost_usd * 10000) / 10000 }))
    .sort((a, b) => b.cost_usd - a.cost_usd)

  // Tool call volume
  const toolCountMap = new Map<string, number>()
  for (const row of (agentRunsRes.data ?? []) as AgentRunRow[]) {
    const calls = row.tool_calls ?? []
    for (const call of calls) {
      const name = call.name ?? call.type ?? 'unknown'
      toolCountMap.set(name, (toolCountMap.get(name) ?? 0) + 1)
    }
  }
  const toolCallVolume = Array.from(toolCountMap.entries())
    .map(([toolName, count]) => ({ toolName, count }))
    .sort((a, b) => b.count - a.count)

  // Storage stats
  const storageStats = {
    memoryCount: memoriesCountRes.count ?? 0,
    proposalCount: proposalsCountRes.count ?? 0,
    chunkCount: chunksCountRes.count ?? 0,
  }

  // Budget config
  const configRows = (configRes.data ?? []) as ConfigRow[]
  const configMap = new Map(configRows.map((r) => [r.key, r.value]))
  const rawBudget = configMap.get('cost_budget_usd')
  const budgetUsd = rawBudget === null || rawBudget === undefined ? null : (rawBudget as number)
  const rawThreshold = configMap.get('cost_alert_threshold_pct')
  const alertThresholdPct = typeof rawThreshold === 'number' ? rawThreshold : 80

  const avgCostPerDay = period > 0 ? Math.round((totalCost / period) * 10000) / 10000 : 0

  return NextResponse.json({
    spendByDay,
    spendByUser,
    spendByEventType,
    spendByModel,
    toolCallVolume,
    totalCost: Math.round(totalCost * 10000) / 10000,
    totalTokensIn,
    totalTokensOut,
    avgCostPerDay,
    storageStats,
    budgetUsd,
    alertThresholdPct,
  })
}
