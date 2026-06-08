import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx
  const { userId } = await params

  const { error } = await serviceClient
    .from('memories')
    .update({ rtbf_flagged: true, rtbf_flagged_at: new Date().toISOString() })
    .eq('author_id', userId)
    .eq('status', 'active')
    .eq('rtbf_flagged', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'rtbf.flagged',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'user',
    target_id: userId,
    metadata: {},
    ip_address: null,
  })

  return NextResponse.json({ ok: true })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx
  const { userId } = await params

  const { data: memories, error } = await serviceClient
    .from('memories')
    .select('id, content, type, sensitivity_level, created_at, rtbf_flagged_at, source_refs')
    .eq('author_id', userId)
    .eq('rtbf_flagged', true)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ memories: memories ?? [] })
}
