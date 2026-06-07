import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'

const QUERY_AGENT_CONFIG_ID = '20000000-0000-0000-0000-000000000005'

const OPERATOR_ROLES = new Set(['Operator', 'Manager', 'Owner', 'Admin'])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    claim?: string
    suggested_type?: string
    entity_refs?: string[]
    sensitivity_level?: string
  }

  if (!body.claim?.trim()) {
    return NextResponse.json({ error: 'claim is required' }, { status: 400 })
  }
  if (!['episodic', 'semantic', 'procedural'].includes(body.suggested_type ?? '')) {
    return NextResponse.json({ error: 'suggested_type must be episodic, semantic, or procedural' }, { status: 400 })
  }

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  // Load role to determine gating
  const { data: publicUser } = await serviceClient
    .from('users')
    .select('role_id, roles(name)')
    .eq('id', authUser.id)
    .single()

  const roleName = (publicUser?.roles as { name: string } | null)?.name ?? 'Member'
  const isMember = !OPERATOR_ROLES.has(roleName)

  // Member proposals always go to review queue, sensitivity forced to internal
  const status = isMember ? 'pending_review' : 'pending'
  const sensitivityLevel = isMember ? 'internal' : (body.sensitivity_level ?? 'internal')
  const entityRefs = body.entity_refs?.filter(Boolean) ?? []

  const { error } = await serviceClient.from('memory_proposals').insert({
    id: crypto.randomUUID(),
    claim: body.claim.trim(),
    suggested_type: body.suggested_type as 'episodic' | 'semantic' | 'procedural',
    sources: {},
    confidence: 1.0,
    entity_refs: { refs: entityRefs, sensitivity_level: sensitivityLevel },
    acting_user_id: authUser.id,
    agent_id: QUERY_AGENT_CONFIG_ID,
    task_id: crypto.randomUUID(),
    status,
    reviewed_by: null,
    reviewed_at: null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status, pendingReview: isMember }, { status: 201 })
}
