import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClient, SYSTEM_USER_ID } from '@brain/core'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

// Matches the Json type in database.types.ts — needed for jsonb columns.
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

function toJson(v: unknown): Json {
  return v as Json
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS returns own routines; Manager+ see all
  const { data, error } = await supabase
    .from('routines')
    .select('*, agent_configs(id, name, model)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ routines: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>
  const scope = body.scope ?? 'user'

  if (scope === 'system') {
    // System routines: Owner/Admin only, inserted via service role
    const ctx = await requireOwner()
    if (isErrorResponse(ctx)) return ctx
    const { serviceClient } = ctx

    const { data, error } = await serviceClient
      .from('routines')
      .insert({
        name: body.name as string,
        description: (body.description as string | undefined) ?? '',
        is_active: true,
        trigger_type: body.trigger_type as string,
        cron_schedule: (body.cron_schedule as string | undefined) ?? null,
        webhook_connector: (body.webhook_connector as string | undefined) ?? null,
        webhook_event: (body.webhook_event as string | undefined) ?? null,
        webhook_filters: body.webhook_filters != null ? toJson(body.webhook_filters) : null,
        agent_config_id: body.agent_config_id as string,
        additional_context: (body.additional_context as string | undefined) ?? null,
        output_type: body.output_type as string,
        output_config: toJson(body.output_config ?? {}),
        created_by: SYSTEM_USER_ID,
        scope: 'system',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (body.trigger_type === 'cron') {
      await serviceClient.rpc('enqueue_job', { p_name: 'routine.schedule.sync', p_data: {} })
    }

    return NextResponse.json({ routine: data }, { status: 201 })
  }

  // User-scope routine: session client insert (RLS enforces created_by = auth.uid())
  const { data, error } = await supabase
    .from('routines')
    .insert({
      name: body.name as string,
      description: (body.description as string | undefined) ?? '',
      is_active: true,
      trigger_type: body.trigger_type as string,
      cron_schedule: (body.cron_schedule as string | undefined) ?? null,
      webhook_connector: (body.webhook_connector as string | undefined) ?? null,
      webhook_event: (body.webhook_event as string | undefined) ?? null,
      webhook_filters: body.webhook_filters != null ? toJson(body.webhook_filters) : null,
      agent_config_id: body.agent_config_id as string,
      additional_context: (body.additional_context as string | undefined) ?? null,
      output_type: body.output_type as string,
      output_config: toJson(body.output_config ?? {}),
      created_by: authUser.id,
      scope: 'user',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.trigger_type === 'cron') {
    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    )
    await serviceClient.rpc('enqueue_job', { p_name: 'routine.schedule.sync', p_data: {} })
  }

  return NextResponse.json({ routine: data }, { status: 201 })
}
