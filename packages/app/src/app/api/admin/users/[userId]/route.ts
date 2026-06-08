import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx
  const { userId } = await params

  const body = await req.json() as { role_id?: string }
  if (!body.role_id) return NextResponse.json({ error: 'role_id is required' }, { status: 400 })

  // Fetch old role for audit log
  const { data: current } = await serviceClient
    .from('users')
    .select('role_id')
    .eq('id', userId)
    .maybeSingle()

  const { error } = await serviceClient
    .from('users')
    .update({ role_id: body.role_id })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'permission.change',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'user',
    target_id: userId,
    metadata: { old_role_id: current?.role_id ?? null, new_role_id: body.role_id },
    ip_address: null,
  })

  return NextResponse.json({ ok: true })
}
