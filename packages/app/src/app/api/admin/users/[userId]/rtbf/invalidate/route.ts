import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx
  const { userId } = await params

  const body = await req.json() as { memoryIds?: string[] }
  if (!Array.isArray(body.memoryIds) || body.memoryIds.length === 0) {
    return NextResponse.json({ error: 'memoryIds is required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { error } = await serviceClient
    .from('memories')
    .update({ status: 'invalidated', valid_to: now })
    .in('id', body.memoryIds)
    .eq('author_id', userId)  // safety: only invalidate memories belonging to this user

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Write one audit log entry per invalidated memory
  const auditRows = body.memoryIds.map((memId) => ({
    id: crypto.randomUUID(),
    action_type: 'memory.invalidated',
    actor_id: actorId,
    actor_type: 'user' as const,
    target_type: 'memory',
    target_id: memId,
    metadata: { reason: 'rtbf' },
    ip_address: null,
  }))

  await serviceClient.from('audit_log').insert(auditRows)

  return NextResponse.json({ ok: true, count: body.memoryIds.length })
}
