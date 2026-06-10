import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if (isErrorResponse(auth)) return auth

  const { id } = await params
  const { serviceClient } = auth

  const { data, error } = await serviceClient
    .from('agent_config_versions')
    .select('*')
    .eq('agent_config_id', id)
    .order('version', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ versions: data ?? [] })
}
