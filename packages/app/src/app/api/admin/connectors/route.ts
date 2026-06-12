import { NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

type ConnectionRow = {
  id: string
  connector_type: string
  scope: string
  status: string
  last_synced_at: string | null
  webhook_expires_at: string | null
  owner_user_id: string | null
  created_at: string
  exclusion_rules: Record<string, unknown> | null
}

type UserRow = {
  id: string
  email: string
}

type JobRunRow = {
  job_type: string
  output: Record<string, number> | null
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

  const cutoff30d = startOf(30)

  const [connectionsRes, usersRes, jobRunsRes] = await Promise.all([
    serviceClient
      .from('connections')
      .select('id, connector_type, scope, status, last_synced_at, webhook_expires_at, owner_user_id, created_at, exclusion_rules')
      .order('created_at', { ascending: false })
      .limit(200),

    serviceClient.from('users').select('id, email').limit(500),

    serviceClient
      .from('job_runs')
      .select('job_type, output')
      .in('job_type', ['gmail.sync', 'drive.sync'])
      .gte('started_at', cutoff30d)
      .not('output', 'is', null)
      .limit(5000),
  ])

  if (connectionsRes.error) return NextResponse.json({ error: connectionsRes.error.message }, { status: 500 })

  const userMap = new Map(((usersRes.data ?? []) as UserRow[]).map((u) => [u.id, u.email]))

  const connections = ((connectionsRes.data ?? []) as ConnectionRow[]).map((c) => ({
    ...c,
    ownerEmail: c.owner_user_id ? (userMap.get(c.owner_user_id) ?? c.owner_user_id) : null,
  }))

  // Ingestion stats grouped by connector type
  const statsMap: Record<string, { processed: number; indexed: number; proposed: number; dropped: number }> = {
    gmail: { processed: 0, indexed: 0, proposed: 0, dropped: 0 },
    google_drive: { processed: 0, indexed: 0, proposed: 0, dropped: 0 },
  }
  for (const row of (jobRunsRes.data ?? []) as JobRunRow[]) {
    const key = row.job_type === 'gmail.sync' ? 'gmail' : 'google_drive'
    const out = row.output ?? {}
    statsMap[key].processed += out.processed ?? 0
    statsMap[key].indexed += out.indexed ?? 0
    statsMap[key].proposed += out.proposed ?? 0
    statsMap[key].dropped += out.dropped ?? 0
  }

  return NextResponse.json({ connections, ingestionStats: statsMap })
}
