import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Verify the caller can see this routine
  const { data: routine } = await supabase
    .from('routines')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (!routine) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // RLS on job_runs: acting_user_id = auth.uid() or Manager+
  // For system routines the acting_user_id is the system user — service client needed.
  // Use the session client; Operators who can see the routine can also see its runs.
  const { data: runs, error } = await supabase
    .from('job_runs')
    .select('id, status, triggered_by, started_at, completed_at, tokens_used, cost_usd, output, error')
    .eq('routine_id', id)
    .order('started_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ runs: runs ?? [] })
}
