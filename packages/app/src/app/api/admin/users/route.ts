import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function GET() {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const { data: users, error } = await serviceClient
    .from('users')
    .select('id, email, full_name, role_id, is_active, created_at, last_seen_at, roles(id, name, clearance_level)')
    .neq('id', SYSTEM_USER_ID)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: users ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const body = await req.json() as { email?: string }
  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const { error } = await serviceClient.auth.admin.inviteUserByEmail(body.email.trim())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
