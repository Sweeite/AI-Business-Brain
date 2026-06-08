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

  // 1. Mark user inactive
  await serviceClient.from('users').update({ is_active: false }).eq('id', userId)

  // 2. Ban the auth user — 876000h (~100 years) revokes all existing sessions
  await serviceClient.auth.admin.updateUserById(userId, { ban_duration: '876000h' })

  // 3. Revoke all OAuth connections
  await serviceClient
    .from('connections')
    .update({ status: 'revoked' })
    .eq('owner_user_id', userId)
    .neq('status', 'revoked')

  // 4. Disable all user routines
  await serviceClient
    .from('routines')
    .update({ is_active: false })
    .eq('created_by', userId)
    .eq('is_active', true)

  // 5. Audit log
  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'user.deactivated',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'user',
    target_id: userId,
    metadata: {},
    ip_address: null,
  })

  return NextResponse.json({ ok: true })
}
