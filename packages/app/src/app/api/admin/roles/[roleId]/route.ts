import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> },
) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx
  const { roleId } = await params

  const body = await req.json() as {
    name?: string
    clearance_level?: string
    permissions?: Record<string, boolean>
  }

  if (body.name === undefined && body.clearance_level === undefined && body.permissions === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await serviceClient
    .from('roles')
    .update({
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.clearance_level !== undefined && { clearance_level: body.clearance_level }),
      ...(body.permissions !== undefined && { permissions: body.permissions as Record<string, boolean> }),
    })
    .eq('id', roleId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'role.updated',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'role',
    target_id: roleId,
    metadata: { name: body.name ?? null, clearance_level: body.clearance_level ?? null },
    ip_address: null,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> },
) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx
  const { roleId } = await params

  // Block deletion if any active users are assigned to this role
  const { count } = await serviceClient
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId)
    .eq('is_active', true)

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a role with active users assigned to it.' },
      { status: 409 },
    )
  }

  const { error } = await serviceClient.from('roles').delete().eq('id', roleId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'role.deleted',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'role',
    target_id: roleId,
    metadata: {},
    ip_address: null,
  })

  return NextResponse.json({ ok: true })
}
