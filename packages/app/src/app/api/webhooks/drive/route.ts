import { createSupabaseClient } from '@brain/core'

export async function POST(req: Request): Promise<Response> {
  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  // 1. Verify channel token
  const incomingToken = req.headers.get('X-Goog-Channel-Token')
  if (!incomingToken) {
    return new Response(null, { status: 401 })
  }

  const { data: configRow } = await serviceClient
    .from('system_config')
    .select('value')
    .eq('key', 'drive_webhook_channel_token')
    .maybeSingle()

  const expectedToken = (configRow?.value as string | undefined) ?? ''
  if (!expectedToken || expectedToken === 'REPLACE_WITH_SECRET' || incomingToken !== expectedToken) {
    return new Response(null, { status: 401 })
  }

  // 2. Decode notification headers
  const channelId = req.headers.get('X-Goog-Channel-ID')
  const resourceId = req.headers.get('X-Goog-Resource-ID')

  if (!channelId || !resourceId) {
    // Malformed notification — ack to prevent retries
    return new Response(null, { status: 200 })
  }

  // 3. Look up connection by channelId stored in sync_cursor
  const { data: conn } = await serviceClient
    .from('connections')
    .select('id, owner_user_id')
    .eq('connector_type', 'google_drive')
    .eq('status', 'active')
    .filter('sync_cursor->>channelId', 'eq', channelId)
    .maybeSingle()

  if (!conn) {
    // Unknown channel — ack and drop
    return new Response(null, { status: 200 })
  }

  // 4. Enqueue drive.sync job
  await serviceClient.rpc('enqueue_job', {
    p_name: 'drive.sync',
    p_data: { userId: conn.owner_user_id, connectionId: conn.id, triggeredBy: 'webhook' },
  })

  // 5. Fire any webhook routines listening for drive.file.changed
  const { data: routines } = await serviceClient
    .from('routines')
    .select('id')
    .eq('trigger_type', 'webhook')
    .eq('webhook_connector', 'google_drive')
    .eq('webhook_event', 'file.changed')
    .eq('is_active', true)

  for (const r of routines ?? []) {
    await serviceClient.rpc('enqueue_job', {
      p_name: 'routine.run',
      p_data: { routineId: r.id, triggeredBy: 'webhook' },
    })
  }

  return new Response(null, { status: 200 })
}
