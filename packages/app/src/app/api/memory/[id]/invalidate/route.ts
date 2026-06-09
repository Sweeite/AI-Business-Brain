import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if (isErrorResponse(auth)) return auth

  const { id } = await params
  const { actorId, serviceClient } = auth

  const { data: memory, error: fetchError } = await serviceClient
    .from('memories')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchError || !memory) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
  }
  if (memory.status === 'invalidated') {
    return NextResponse.json({ error: 'Memory is already invalidated' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { error: updateError } = await serviceClient
    .from('memories')
    .update({ status: 'invalidated', valid_to: now })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'memory_invalidated',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'memory',
    target_id: id,
    metadata: { memory_id: id },
  })

  return NextResponse.json({ ok: true })
}
