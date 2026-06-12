import { NextRequest, NextResponse } from 'next/server'
import { requireOperator, isErrorResponse } from '@/lib/admin-auth'

type JobRunRow = {
  job_type: string
  started_at: string
  output: Record<string, unknown> | null
}

type ProposalRow = {
  confidence: number
  status: string
  created_at: string
}

type MemoryRow = {
  type: string
}

function startOf(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function toDay(iso: string): string {
  return iso.slice(0, 10)
}

export async function GET(req: NextRequest) {
  const ctx = await requireOperator()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const { searchParams } = req.nextUrl
  const period = Math.min(90, Math.max(1, parseInt(searchParams.get('period') ?? '30', 10)))
  const cutoff = startOf(period)
  const cutoff14 = startOf(14)
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    jobRunsRes,
    memoriesRes,
    reviewQueueRes,
    proposalQueueRes,
    drainRunsRes,
    proposalConfRes,
    backlogRes,
  ] = await Promise.all([
    // a) connector sync runs for volume
    serviceClient
      .from('job_runs')
      .select('job_type, started_at, output')
      .in('job_type', ['gmail.sync', 'drive.sync'])
      .gte('started_at', cutoff)
      .order('started_at', { ascending: false })
      .limit(2000),

    // b) memory type distribution
    serviceClient
      .from('memories')
      .select('type')
      .eq('status', 'active')
      .gte('created_at', cutoff)
      .limit(5000),

    // c) review queue current depth
    serviceClient
      .from('memory_proposals')
      .select('id, created_at')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true })
      .limit(5000),

    // d) proposal queue current totals
    serviceClient
      .from('memory_proposals')
      .select('status')
      .in('status', ['pending', 'pending_review'])
      .limit(5000),

    // e) drain rate — last 24h
    serviceClient
      .from('job_runs')
      .select('output')
      .eq('job_type', 'memory.proposal.drain')
      .gte('started_at', cutoff24h)
      .not('output', 'is', null)
      .limit(500),

    // f) confidence distribution
    serviceClient
      .from('memory_proposals')
      .select('confidence, status, created_at')
      .gte('created_at', cutoff)
      .limit(2000),

    // g) backlog trend — last 14 days
    serviceClient
      .from('memory_proposals')
      .select('created_at, status')
      .gte('created_at', cutoff14)
      .limit(2000),
  ])

  if (jobRunsRes.error) return NextResponse.json({ error: jobRunsRes.error.message }, { status: 500 })
  if (memoriesRes.error) return NextResponse.json({ error: memoriesRes.error.message }, { status: 500 })
  if (reviewQueueRes.error) return NextResponse.json({ error: reviewQueueRes.error.message }, { status: 500 })

  // a) Volume — group by day + connector
  const volumeMap = new Map<string, { day: string; connector: string; processed: number; indexed: number; proposed: number; dropped: number }>()
  for (const row of (jobRunsRes.data ?? []) as JobRunRow[]) {
    const day = toDay(row.started_at)
    const connector = row.job_type === 'gmail.sync' ? 'Gmail' : 'Drive'
    const key = `${day}|${connector}`
    const out = (row.output ?? {}) as Record<string, number>
    const existing = volumeMap.get(key) ?? { day, connector, processed: 0, indexed: 0, proposed: 0, dropped: 0 }
    volumeMap.set(key, {
      ...existing,
      processed: existing.processed + (out.processed ?? 0),
      indexed: existing.indexed + (out.indexed ?? 0),
      proposed: existing.proposed + (out.proposed ?? 0),
      dropped: existing.dropped + (out.dropped ?? 0),
    })
  }
  const volume = Array.from(volumeMap.values()).sort((a, b) => b.day.localeCompare(a.day))

  // b) Memory types
  const typeCounts = { episodic: 0, semantic: 0, procedural: 0 }
  for (const row of (memoriesRes.data ?? []) as MemoryRow[]) {
    if (row.type === 'episodic') typeCounts.episodic++
    else if (row.type === 'semantic') typeCounts.semantic++
    else if (row.type === 'procedural') typeCounts.procedural++
  }

  // c) Review queue
  const reviewRows = reviewQueueRes.data ?? []
  const reviewQueue = {
    depth: reviewRows.length,
    oldestItemAt: reviewRows.length > 0 ? (reviewRows[0] as { created_at: string }).created_at : null,
  }

  // d) Proposal queue
  let reviewDepth = 0
  let drainDepth = 0
  for (const row of (proposalQueueRes.data ?? []) as { status: string }[]) {
    if (row.status === 'pending_review') reviewDepth++
    else if (row.status === 'pending') drainDepth++
  }

  // e) Drain rate
  let committed24h = 0
  for (const row of (drainRunsRes.data ?? []) as { output: Record<string, unknown> | null }[]) {
    const out = (row.output ?? {}) as Record<string, number>
    committed24h += out.committed ?? 0
  }
  const drainRate = Math.round((committed24h / 24) * 10) / 10

  // f) Confidence distribution
  const confBuckets: Record<string, number> = {
    'Low (<0.5)': 0,
    'Medium (0.5–0.7)': 0,
    'High (0.7–0.9)': 0,
    'Very High (0.9+)': 0,
  }
  for (const row of (proposalConfRes.data ?? []) as ProposalRow[]) {
    const c = row.confidence ?? 0
    if (c < 0.5) confBuckets['Low (<0.5)']++
    else if (c < 0.7) confBuckets['Medium (0.5–0.7)']++
    else if (c < 0.9) confBuckets['High (0.7–0.9)']++
    else confBuckets['Very High (0.9+)']++
  }
  const confidenceDist = Object.entries(confBuckets).map(([bucket, count]) => ({ bucket, count }))

  // g) Backlog trend — last 14 days
  const trendMap = new Map<string, { day: string; incoming: number; resolved: number }>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const day = toDay(d.toISOString())
    trendMap.set(day, { day, incoming: 0, resolved: 0 })
  }
  for (const row of (backlogRes.data ?? []) as ProposalRow[]) {
    const day = toDay(row.created_at)
    const entry = trendMap.get(day)
    if (!entry) continue
    entry.incoming++
    if (row.status === 'committed' || row.status === 'rejected') entry.resolved++
  }
  const backlogTrend = Array.from(trendMap.values())

  return NextResponse.json({
    volume,
    memoryTypes: typeCounts,
    reviewQueue,
    proposalQueue: { reviewDepth, drainDepth },
    drainRate,
    confidenceDist,
    backlogTrend,
  })
}
