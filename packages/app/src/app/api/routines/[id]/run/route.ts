import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Verify the caller can see this routine (RLS check)
  const { data: routine } = await supabase
    .from('routines')
    .select('id, is_active')
    .eq('id', id)
    .maybeSingle()

  if (!routine) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!routine.is_active) return NextResponse.json({ error: 'Routine is disabled' }, { status: 400 })

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  await serviceClient.rpc('enqueue_job', {
    p_name: 'routine.run',
    p_data: { routineId: id, triggeredBy: 'manual' },
  })

  return NextResponse.json({ ok: true, jobEnqueued: true })
}
