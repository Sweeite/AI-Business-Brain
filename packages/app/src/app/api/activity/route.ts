import { NextRequest, NextResponse } from 'next/server'
import { requireManager, isErrorResponse } from '@/lib/admin-auth'

const PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const ctx = await requireManager()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const { searchParams } = req.nextUrl
  const agentConfigId = searchParams.get('agent_config_id') ?? ''
  const userId = searchParams.get('user_id') ?? ''
  const dateFrom = searchParams.get('date_from') ?? ''
  const dateTo = searchParams.get('date_to') ?? ''
  const ratingParam = searchParams.get('rating') ?? ''
  const status = searchParams.get('status') ?? ''
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))
  const offset = page * PAGE_SIZE

  let query = serviceClient
    .from('agent_runs')
    .select(
      'id, status, trigger_context, created_at, tokens_used, cost_usd, duration_ms, user_rating, user_feedback, acting_user_id, agent_config_id, users(email, full_name), agent_configs(name)',
      { count: 'exact' }
    )

  if (agentConfigId) query = query.eq('agent_config_id', agentConfigId)
  if (userId === '__null__') query = query.is('acting_user_id', null)
  else if (userId) query = query.eq('acting_user_id', userId)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`)
  if (ratingParam !== '') query = query.eq('user_rating', parseInt(ratingParam, 10))
  if (status && status !== 'all') query = query.eq('status', status)

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total = count ?? 0
  return NextResponse.json({ runs: data ?? [], total, page })
}
