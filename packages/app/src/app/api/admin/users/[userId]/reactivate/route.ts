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

  // 1. Mark user active
  await serviceClient.from('users').update({ is_active: true }).eq('id', userId)

  // 2. Unban the auth user — removes the ~100-year ban set during deactivation
  await serviceClient.auth.admin.updateUserById(userId, { ban_duration: 'none' })

  // Connections and routines are NOT auto-restored — admin must reconnect/re-enable manually.

  // 3. Audit log
  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'user.reactivated',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'user',
    target_id: userId,
    metadata: {},
    ip_address: null,
  })

  return NextResponse.json({ ok: true })
}
