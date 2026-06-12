import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function PATCH(req: NextRequest) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx

  const body = await req.json() as { budget_usd?: number | null }

  // budget_usd can be null (disables alert) or a positive number
  if (body.budget_usd !== null && body.budget_usd !== undefined) {
    if (typeof body.budget_usd !== 'number' || body.budget_usd <= 0) {
      return NextResponse.json({ error: 'budget_usd must be a positive number or null' }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  // Store 0 to represent "no limit" — system_config.value is NOT NULL so we can't store SQL null
  const newValue = body.budget_usd === null || body.budget_usd === undefined ? 0 : body.budget_usd

  const { error } = await serviceClient
    .from('system_config')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ value: newValue as any, updated_by: actorId, updated_at: now })
    .eq('key', 'cost_budget_usd')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'config.changed',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'system_config',
    target_id: 'cost_budget_usd',
    metadata: { key: 'cost_budget_usd', new_value: newValue },
    ip_address: null,
  })

  return NextResponse.json({ ok: true })
}
