import { NextRequest, NextResponse } from 'next/server'
import { requireManager, isErrorResponse } from '@/lib/admin-auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const ctx = await requireManager()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const { runId } = await params

  const { data, error } = await serviceClient
    .from('agent_runs')
    .select(
      'id, status, trigger_context, created_at, tokens_used, cost_usd, duration_ms, user_rating, user_feedback, memory_retrieved, tool_calls, reasoning_trace, output, provenance_labels, acting_user_id, agent_config_id, users(email, full_name), agent_configs(name)'
    )
    .eq('id', runId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ run: data })
}
