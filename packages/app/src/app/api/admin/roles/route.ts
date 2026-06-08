import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function GET() {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const { data: roles, error } = await serviceClient
    .from('roles')
    .select('*')
    .order('clearance_level', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ roles: roles ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx

  const body = await req.json() as {
    name?: string
    clearance_level?: string
    permissions?: Record<string, boolean>
  }

  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!body.clearance_level) return NextResponse.json({ error: 'clearance_level is required' }, { status: 400 })

  const { data: role, error } = await serviceClient
    .from('roles')
    .insert({
      id: crypto.randomUUID(),
      name: body.name.trim(),
      clearance_level: body.clearance_level,
      permissions: body.permissions ?? {},
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'role.created',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'role',
    target_id: role.id,
    metadata: { name: role.name },
    ip_address: null,
  })

  return NextResponse.json({ role })
}
