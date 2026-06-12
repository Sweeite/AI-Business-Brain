import { NextResponse } from 'next/server'
import { requireOperator, isErrorResponse } from '@/lib/admin-auth'

export async function GET() {
  const ctx = await requireOperator()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const { data, error } = await serviceClient
    .from('memory_proposals')
    .select('id, claim, suggested_type, confidence, status, created_at, acting_user_id, sources, entity_refs')
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const proposals = data ?? []

  // Resolve user emails for acting_user_id values
  const userIds = [...new Set(proposals.map((p) => p.acting_user_id).filter(Boolean))] as string[]
  let userMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: users } = await serviceClient
      .from('users')
      .select('id, email, full_name')
      .in('id', userIds)
    for (const u of users ?? []) {
      userMap[u.id] = (u as { id: string; email: string; full_name: string | null }).full_name
        ?? (u as { id: string; email: string; full_name: string | null }).email
    }
  }

  const enriched = proposals.map((p) => ({
    ...p,
    submittedBy: p.acting_user_id ? (userMap[p.acting_user_id] ?? p.acting_user_id) : 'System',
  }))

  return NextResponse.json({ proposals: enriched })
}
