import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

const ALLOWED_CONFIG_KEYS = new Set([
  'memory_proposal_drain_schedule',
  'memory_proposal_drain_active',
  'connector_sync_schedule',
  'connector_sync_active',
  'token_refresh_schedule',
  'token_refresh_active',
  'drive_webhook_renew_schedule',
  'drive_webhook_renew_active',
  'improvement_analysis_cron_schedule',
  'improvement_analysis_active',
  'consolidation_cron_schedule',
  'consolidation_cron_active',
  'decay_cron_schedule',
  'decay_cron_active',
  'retrieval_min_relevance',
  'consolidation_dedup_similarity_threshold',
  'decay_min_utility_score',
  'decay_min_age_days',
  'chunk_ttl_days',
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx
  const { key } = await params

  if (!ALLOWED_CONFIG_KEYS.has(key)) {
    return NextResponse.json({ error: 'Key not modifiable via this endpoint' }, { status: 400 })
  }

  const body = await req.json() as { value?: unknown }
  if (body.value === undefined) {
    return NextResponse.json({ error: 'value is required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await serviceClient
    .from('system_config')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ value: body.value as any, updated_by: actorId, updated_at: now })
    .eq('key', key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'config.changed',
    actor_id: actorId,
    actor_type: 'user',
    target_type: 'system_config',
    target_id: key,
    metadata: { key },
    ip_address: null,
  })

  return NextResponse.json({ ok: true })
}
