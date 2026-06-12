import { NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

type JobRunRow = {
  id: string
  job_type: string
  status: string
  started_at: string
  completed_at: string | null
  error: string | null
}

type AgentRunRow = {
  status: string
  created_at: string
}

type ConnectionRow = {
  id: string
  connector_type: string
  scope: string
  status: string
  last_synced_at: string | null
  webhook_expires_at: string | null
  owner_user_id: string | null
}

type UserRow = {
  id: string
  email: string
}

type ProposalRow = {
  status: string
}

type ConfigRow = {
  key: string
  value: unknown
}

type CostRow = {
  cost_usd: number | null
}

type MissRow = {
  id: string
}

function startOf(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function GET() {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const cutoff7d = startOf(7)
  const cutoff30d = startOf(30)

  const [
    failedJobsRes,
    agentRunsRes,
    connectionsRes,
    usersRes,
    proposalsRes,
    runningJobsRes,
    configRes,
    costRes,
    missRes,
  ] = await Promise.all([
    serviceClient
      .from('job_runs')
      .select('id, job_type, status, started_at, completed_at, error')
      .eq('status', 'failed')
      .order('started_at', { ascending: false })
      .limit(50),

    serviceClient
      .from('agent_runs')
      .select('status, created_at')
      .gte('created_at', cutoff7d)
      .limit(5000),

    serviceClient
      .from('connections')
      .select('id, connector_type, scope, status, last_synced_at, webhook_expires_at, owner_user_id')
      .limit(200),

    serviceClient
      .from('users')
      .select('id, email')
      .limit(500),

    serviceClient
      .from('memory_proposals')
      .select('status')
      .in('status', ['pending', 'pending_review'])
      .limit(5000),

    serviceClient
      .from('job_runs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'running'),

    serviceClient
      .from('system_config')
      .select('key, value')
      .in('key', [
        'cost_budget_usd',
        'cost_alert_threshold_pct',
        'quality_abstention_drop_pct',
        'quality_low_rating_pct',
        'quality_miss_daily_count',
        'quality_unused_memory_pct',
      ]),

    serviceClient
      .from('cost_events')
      .select('cost_usd')
      .gte('created_at', cutoff30d)
      .limit(50000),

    serviceClient
      .from('miss_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', cutoff7d),
  ])

  if (failedJobsRes.error) return NextResponse.json({ error: failedJobsRes.error.message }, { status: 500 })
  if (connectionsRes.error) return NextResponse.json({ error: connectionsRes.error.message }, { status: 500 })

  // LLM error rate
  const agentRuns = (agentRunsRes.data ?? []) as AgentRunRow[]
  const totalAgentRuns = agentRuns.length
  const failedAgentRuns = agentRuns.filter((r) => r.status === 'failed').length
  const llmErrorRatePct = totalAgentRuns > 0
    ? Math.round((failedAgentRuns / totalAgentRuns) * 1000) / 10
    : 0

  // User email map
  const users = (usersRes.data ?? []) as UserRow[]
  const userMap = new Map(users.map((u) => [u.id, u.email]))

  // Connections enriched with owner email
  const connections = ((connectionsRes.data ?? []) as ConnectionRow[]).map((c) => ({
    id: c.id,
    connector_type: c.connector_type,
    scope: c.scope,
    status: c.status,
    last_synced_at: c.last_synced_at,
    webhook_expires_at: c.webhook_expires_at,
    ownerEmail: c.owner_user_id ? (userMap.get(c.owner_user_id) ?? c.owner_user_id) : null,
  }))

  // Queue depths
  let proposalPending = 0
  let reviewPending = 0
  for (const row of (proposalsRes.data ?? []) as ProposalRow[]) {
    if (row.status === 'pending') proposalPending++
    else if (row.status === 'pending_review') reviewPending++
  }
  const ingestionRunning = runningJobsRes.count ?? 0

  // Config map
  const configRows = (configRes.data ?? []) as ConfigRow[]
  const cfg = new Map(configRows.map((r) => [r.key, r.value]))

  // Active alerts — check against thresholds
  const alerts: { key: string; message: string; severity: 'warning' | 'critical' }[] = []

  // Cost budget alert
  const budgetUsd = (cfg.get('cost_budget_usd') as number | null) ?? null
  const alertThresholdPct = (cfg.get('cost_alert_threshold_pct') as number | null) ?? 80
  if (budgetUsd && budgetUsd > 0) {
    const totalCost30d = ((costRes.data ?? []) as CostRow[])
      .reduce((sum, r) => sum + (r.cost_usd ?? 0), 0)
    const pctUsed = (totalCost30d / budgetUsd) * 100
    if (pctUsed >= 100) {
      alerts.push({ key: 'cost_over_budget', message: `Cost budget exceeded: $${totalCost30d.toFixed(2)} of $${budgetUsd} used this month.`, severity: 'critical' })
    } else if (pctUsed >= alertThresholdPct) {
      alerts.push({ key: 'cost_near_budget', message: `Cost is ${pctUsed.toFixed(1)}% of the $${budgetUsd} monthly budget.`, severity: 'warning' })
    }
  }

  // LLM error rate spike alert (>10% failed is warning, >25% is critical)
  if (totalAgentRuns >= 5 && llmErrorRatePct >= 25) {
    alerts.push({ key: 'llm_error_rate_critical', message: `LLM API error rate is ${llmErrorRatePct}% over the last 7 days (${failedAgentRuns}/${totalAgentRuns} runs failed).`, severity: 'critical' })
  } else if (totalAgentRuns >= 5 && llmErrorRatePct >= 10) {
    alerts.push({ key: 'llm_error_rate_warning', message: `LLM API error rate is ${llmErrorRatePct}% over the last 7 days.`, severity: 'warning' })
  }

  // Connector expired/error
  const badConnectors = connections.filter((c) => c.status === 'expired' || c.status === 'error')
  if (badConnectors.length > 0) {
    const names = badConnectors.map((c) => `${c.connector_type}${c.ownerEmail ? ` (${c.ownerEmail})` : ''}`).join(', ')
    alerts.push({ key: 'connector_error', message: `${badConnectors.length} connector(s) need attention: ${names}.`, severity: badConnectors.some((c) => c.status === 'error') ? 'critical' : 'warning' })
  }

  // Quality thresholds — miss count
  const missCount7d = missRes.count ?? 0
  const missDailyThreshold = (cfg.get('quality_miss_daily_count') as number | null) ?? null
  if (missDailyThreshold && missCount7d / 7 > missDailyThreshold) {
    alerts.push({ key: 'miss_rate_high', message: `Daily miss rate (${(missCount7d / 7).toFixed(1)}/day) exceeds threshold of ${missDailyThreshold}/day.`, severity: 'warning' })
  }

  return NextResponse.json({
    failedJobs: (failedJobsRes.data ?? []) as JobRunRow[],
    connectors: connections,
    llmErrorRate: { failedLast7d: failedAgentRuns, totalLast7d: totalAgentRuns, ratePct: llmErrorRatePct },
    queueDepths: { ingestionRunning, proposalPending, reviewPending },
    alerts,
  })
}
