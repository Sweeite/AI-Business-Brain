import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const type = searchParams.get('type') ?? ''
  const namespace = searchParams.get('namespace') ?? ''
  const sensitivityLevel = searchParams.get('sensitivity_level') ?? ''
  const status = searchParams.get('status') ?? 'active'
  const source = searchParams.get('source') ?? ''
  const search = searchParams.get('search') ?? ''
  const dateFrom = searchParams.get('date_from') ?? ''
  const dateTo = searchParams.get('date_to') ?? ''
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))
  const offset = page * PAGE_SIZE

  // Session client — RLS enforces clearance filtering automatically
  let query = supabase
    .from('memories')
    .select(
      'id, type, content, source_refs, created_at, last_retrieved_at, sensitivity_level, zone, namespace, status, valid_from, valid_to',
      { count: 'exact' }
    )

  if (type) query = query.eq('type', type)
  if (namespace) query = query.eq('namespace', namespace)
  if (sensitivityLevel) query = query.eq('sensitivity_level', sensitivityLevel)
  if (status === 'active') query = query.eq('status', 'active')
  else if (status === 'invalidated') query = query.eq('status', 'invalidated')
  // status === 'all' → no filter
  if (search) query = query.ilike('content', `%${search}%`)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo)
  if (source) {
    query = query.filter('source_refs::text', 'ilike', `%"connector_type":"${source}"%`)
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total = count ?? 0
  return NextResponse.json({
    memories: data ?? [],
    total,
    page,
    hasMore: offset + PAGE_SIZE < total,
  })
}
