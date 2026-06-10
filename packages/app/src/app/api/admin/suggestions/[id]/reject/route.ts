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

  const { data: suggestion, error: fetchError } = await serviceClient
    .from('improvement_suggestions')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchError || !suggestion) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
  }
  if (suggestion.status !== 'pending') {
    return NextResponse.json({ error: 'Suggestion is not pending' }, { status: 400 })
  }

  const { error } = await serviceClient
    .from('improvement_suggestions')
    .update({
      status: 'rejected',
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
