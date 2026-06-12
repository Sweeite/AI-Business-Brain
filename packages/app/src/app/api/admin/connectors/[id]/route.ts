import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const { error } = await serviceClient
    .from('connections')
    .update({ status: 'revoked' })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
