import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

type AuditRow = {
  id: string
  action_type: string
  actor_id: string
  actor_type: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  ip_address: unknown
  created_at: string
}

type UserRow = {
  id: string
  email: string
}

export async function GET(req: NextRequest) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const { searchParams } = req.nextUrl
  const userId = searchParams.get('userId') ?? null
  const actionType = searchParams.get('actionType') ?? null
  const startDate = searchParams.get('startDate') ?? null
  const endDate = searchParams.get('endDate') ?? null
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))

  // Build filtered query with count
  let query = serviceClient
    .from('audit_log')
    .select('id, action_type, actor_id, actor_type, target_type, target_id, metadata, ip_address, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (userId) query = query.eq('actor_id', userId)
  if (actionType) query = query.eq('action_type', actionType)
  if (startDate) query = query.gte('created_at', startDate)
  if (endDate) query = query.lte('created_at', endDate + 'T23:59:59Z')

  const [auditRes, usersRes, actionTypesRes] = await Promise.all([
    query,
    serviceClient.from('users').select('id, email').limit(500),
    serviceClient
      .from('audit_log')
      .select('action_type')
      .limit(1000),
  ])

  if (auditRes.error) return NextResponse.json({ error: auditRes.error.message }, { status: 500 })

  const userMap = new Map(((usersRes.data ?? []) as UserRow[]).map((u) => [u.id, u.email]))

  const events = ((auditRes.data ?? []) as AuditRow[]).map((row) => ({
    id: row.id,
    action_type: row.action_type,
    actor_id: row.actor_id,
    actor_email: userMap.get(row.actor_id) ?? row.actor_id,
    actor_type: row.actor_type,
    target_type: row.target_type,
    target_id: row.target_id,
    metadata: row.metadata,
    ip_address: row.ip_address,
    created_at: row.created_at,
  }))

  // Distinct action types for filter dropdown
  const actionTypes = Array.from(
    new Set(
      ((actionTypesRes.data ?? []) as { action_type: string }[]).map((r) => r.action_type)
    )
  ).sort()

  return NextResponse.json({
    events,
    total: auditRes.count ?? 0,
    actionTypes,
  })
}
