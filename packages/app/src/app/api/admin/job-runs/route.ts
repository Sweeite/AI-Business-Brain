import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { serviceClient } = ctx

  const { searchParams } = new URL(req.url)
  const jobType = searchParams.get('jobType')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)

  let query = serviceClient
    .from('job_runs')
    .select('id, job_type, status, started_at, completed_at, error, tokens_used, cost_usd')
    .order('started_at', { ascending: false })
    .limit(limit)

  if (jobType) {
    query = query.eq('job_type', jobType)
  }

  const { data: runs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ runs: runs ?? [] })
}
