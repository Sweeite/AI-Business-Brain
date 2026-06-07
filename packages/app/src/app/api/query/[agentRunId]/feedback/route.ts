import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentRunId: string }> }
) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentRunId } = await params
  const body = await req.json() as { rating?: number; feedback?: string }

  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const { error } = await serviceClient
    .from('agent_runs')
    .update({
      ...(body.rating !== undefined ? { user_rating: body.rating as -1 | 0 | 1 } : {}),
      ...(body.feedback !== undefined ? { user_feedback: body.feedback } : {}),
    })
    .eq('id', agentRunId)
    .eq('acting_user_id', authUser.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
