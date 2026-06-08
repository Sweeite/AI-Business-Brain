import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx
  const { key } = await params

  const body = await req.json() as { value?: unknown }
  if (body.value === undefined) {
    return NextResponse.json({ error: 'value is required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await serviceClient
    .from('system_config')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ value: body.value as any, updated_by: actorId, updated_at: now })
    .eq('key', key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'config.changed',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'system_config',
    target_id: key,
    metadata: { key },
    ip_address: null,
  })

  return NextResponse.json({ ok: true })
}
