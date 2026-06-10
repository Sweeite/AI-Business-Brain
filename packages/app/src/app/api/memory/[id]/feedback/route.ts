import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'

type FeedbackType = 'helpful' | 'wrong' | 'stale' | 'stop_storing'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as {
    rating?: number
    feedback_type: FeedbackType
    note?: string
  }

  const { feedback_type, rating, note } = body
  const validTypes: FeedbackType[] = ['helpful', 'wrong', 'stale', 'stop_storing']
  if (!validTypes.includes(feedback_type)) {
    return NextResponse.json({ error: 'Invalid feedback_type' }, { status: 400 })
  }

  // Insert feedback — session client (RLS allows INSERT own)
  const { error: insertError } = await supabase.from('memory_feedback').insert({
    id: crypto.randomUUID(),
    memory_id: id,
    user_id: authUser.id,
    feedback_type,
    rating: rating ?? null,
    note: note ?? null,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // If wrong or stale: invalidate the memory immediately
  if (feedback_type === 'wrong' || feedback_type === 'stale') {
    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    const { data: memory, error: fetchError } = await serviceClient
      .from('memories')
      .select('id, status')
      .eq('id', id)
      .single()

    if (!fetchError && memory && memory.status !== 'invalidated') {
      const now = new Date().toISOString()
      await serviceClient
        .from('memories')
        .update({ status: 'invalidated', valid_to: now })
        .eq('id', id)

      await serviceClient.from('audit_log').insert({
        id: crypto.randomUUID(),
        action_type: 'memory_invalidated',
        actor_id: authUser.id,
        actor_type: 'user',
        target_type: 'memory',
        target_id: id,
        metadata: { memory_id: id, reason: feedback_type },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
