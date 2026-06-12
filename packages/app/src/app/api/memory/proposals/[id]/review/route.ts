import { NextRequest, NextResponse } from 'next/server'
import { requireOperator, isErrorResponse } from '@/lib/admin-auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireOperator()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx

  const { id } = await params
  const body = await req.json() as { action?: string }

  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const { data: proposal, error: fetchError } = await serviceClient
    .from('memory_proposals')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchError || !proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }
  if (proposal.status !== 'pending_review') {
    return NextResponse.json({ error: 'Proposal is not pending review' }, { status: 400 })
  }

  const now = new Date().toISOString()
  // Approving routes to 'pending' so the drain job picks it up normally.
  const newStatus = body.action === 'approve' ? 'pending' : 'rejected'

  const { error: updateError } = await serviceClient
    .from('memory_proposals')
    .update({ status: newStatus, reviewed_by: actorId, reviewed_at: now })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: body.action === 'approve' ? 'proposal_approved' : 'proposal_rejected',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'memory_proposal',
    target_id: id,
    metadata: { proposal_id: id, action: body.action },
  })

  return NextResponse.json({ ok: true, status: newStatus })
}
