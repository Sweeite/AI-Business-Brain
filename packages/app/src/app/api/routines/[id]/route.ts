import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@brain/core'

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
function toJson(v: unknown): Json { return v as Json }

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as Record<string, unknown>

  // RLS ensures caller can only update routines they own or Manager+ can update any
  const { data, error } = await supabase
    .from('routines')
    .update({
      ...(body.name !== undefined && { name: body.name as string }),
      ...(body.description !== undefined && { description: body.description as string }),
      ...(body.is_active !== undefined && { is_active: body.is_active as boolean }),
      ...(body.cron_schedule !== undefined && { cron_schedule: body.cron_schedule as string | null }),
      ...(body.webhook_connector !== undefined && { webhook_connector: body.webhook_connector as string | null }),
      ...(body.webhook_event !== undefined && { webhook_event: body.webhook_event as string | null }),
      ...(body.webhook_filters !== undefined && { webhook_filters: body.webhook_filters != null ? toJson(body.webhook_filters) : null }),
      ...(body.agent_config_id !== undefined && { agent_config_id: body.agent_config_id as string }),
      ...(body.additional_context !== undefined && { additional_context: body.additional_context as string | null }),
      ...(body.output_type !== undefined && { output_type: body.output_type as string }),
      ...(body.output_config !== undefined && { output_config: toJson(body.output_config) }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If cron schedule changed, trigger a resync
  const cronChanged = body.cron_schedule !== undefined || body.is_active !== undefined
  if (cronChanged) {
    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    )
    await serviceClient.rpc('enqueue_job', {
      p_name: 'routine.schedule.sync',
      p_data: {},
    })
  }

  return NextResponse.json({ routine: data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Load routine first to get trigger_type (for schedule cleanup)
  const { data: existing } = await supabase
    .from('routines')
    .select('id, trigger_type')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('routines')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (existing.trigger_type === 'cron') {
    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    )
    await serviceClient.rpc('enqueue_job', {
      p_name: 'routine.schedule.sync',
      p_data: {},
    })
  }

  return NextResponse.json({ ok: true })
}
