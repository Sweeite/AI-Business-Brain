import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createSupabaseClient,
  executeAgent,
  retrieveMemories,
} from '@brain/core'
import type { Permission, RetrievalContext } from '@brain/core'

const QUERY_AGENT_NAME = 'system.query.user'
const CLEARANCE_MAP: Record<string, number> = {
  public: 1,
  internal: 2,
  management: 3,
  leadership: 4,
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { query?: string }
  if (!body.query?.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }
  const query = body.query.trim()

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  // Load public user + role
  const { data: publicUser } = await serviceClient
    .from('users')
    .select('id, email, full_name, role_id, created_at, last_seen_at, is_active, roles(id, name, clearance_level, permissions)')
    .eq('id', authUser.id)
    .single()

  if (!publicUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const role = publicUser.roles as { id: string; name: string; clearance_level: string; permissions: Record<string, boolean> } | null
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  if (!publicUser.role_id) return NextResponse.json({ error: 'User has no role' }, { status: 404 })

  const user = {
    id: publicUser.id,
    email: publicUser.email,
    full_name: publicUser.full_name,
    role_id: publicUser.role_id,
    created_at: publicUser.created_at,
    last_seen_at: publicUser.last_seen_at,
    is_active: publicUser.is_active,
  }

  // Load query agent config
  const { data: agentConfig } = await serviceClient
    .from('agent_configs')
    .select('id, system_prompt, model, tool_ids')
    .eq('name', QUERY_AGENT_NAME)
    .eq('is_active', true)
    .single()

  if (!agentConfig) {
    return NextResponse.json({ error: 'Query agent config not found' }, { status: 500 })
  }

  const toolIds = agentConfig.tool_ids as string[]

  // Load tools
  const { data: tools } = await serviceClient
    .from('tools')
    .select('*')
    .in('id', toolIds)
    .eq('is_active', true)

  // Build retrieval context
  const clearanceLevel = CLEARANCE_MAP[role.clearance_level] ?? 2
  const retrievalContext: RetrievalContext = {
    clearanceLevel,
    zones: [],
    namespaces: ['org'],
  }

  // Pre-flight memory retrieval
  const memoryContext = await retrieveMemories({
    queryText: query,
    context: retrievalContext,
    serviceClient,
  })

  // Build permissions from role
  const permissions: Permission[] = Object.entries(role.permissions ?? {}).map(
    ([node, granted]) => ({ node, granted: granted as boolean })
  )

  // Execute agent
  const result = await executeAgent({
    user,
    agentConfigId: agentConfig.id,
    model: agentConfig.model,
    systemPrompt: agentConfig.system_prompt,
    tools: (tools ?? []) as Parameters<typeof executeAgent>[0]['tools'],
    memoryContext,
    triggerContext: { type: 'user_query', query },
    permissions,
    serviceClient,
    retrievalContext,
  })

  // Write miss_log if 0 memories and no live provenance
  const hasLiveProvenance = result.provenanceLabels.some((l) => l.type === 'live')
  if (memoryContext.length === 0 && !hasLiveProvenance && result.status === 'completed') {
    await serviceClient.from('miss_log').insert({
      id: crypto.randomUUID(),
      query,
      reason: 'no_memory',
      user_id: authUser.id,
      agent_run_id: result.agentRunId || null,
      resolved: false,
    })
  }

  const isAbstention = result.output.startsWith("I don't have durable knowledge")

  return NextResponse.json({
    output: result.output,
    provenanceLabels: result.provenanceLabels,
    agentRunId: result.agentRunId,
    isAbstention,
    status: result.status,
    error: result.error,
  })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const { data: runs } = await serviceClient
    .from('agent_runs')
    .select('id, output, provenance_labels, created_at, user_rating, trigger_context, status')
    .eq('acting_user_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Filter to user_query runs only
  const history = (runs ?? []).filter(
    (r) => (r.trigger_context as Record<string, unknown>)?.type === 'user_query'
  )

  return NextResponse.json({ history })
}
