import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  const auth = await requireOwner()
  if (isErrorResponse(auth)) return auth

  const { serviceClient } = auth
  const { searchParams } = req.nextUrl
  const statusParam = searchParams.get('status') ?? 'pending'

  // Support comma-separated status values, e.g. "approved,rejected"
  const statuses = statusParam.split(',').map((s) => s.trim()).filter(Boolean)

  const { data: suggestions, error } = await serviceClient
    .from('improvement_suggestions')
    .select('*')
    .in('status', statuses)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch agent config names for suggestions with a target_config_id
  const configIds = [...new Set(
    (suggestions ?? [])
      .map((s) => s.target_config_id)
      .filter((id): id is string => id !== null)
  )]

  let configNames: Record<string, string> = {}
  if (configIds.length > 0) {
    const { data: configs } = await serviceClient
      .from('agent_configs')
      .select('id, name')
      .in('id', configIds)
    for (const c of configs ?? []) {
      configNames[c.id] = c.name
    }
  }

  const enriched = (suggestions ?? []).map((s) => ({
    ...s,
    target_config_name: s.target_config_id ? (configNames[s.target_config_id] ?? null) : null,
  }))

  return NextResponse.json({ suggestions: enriched })
}
