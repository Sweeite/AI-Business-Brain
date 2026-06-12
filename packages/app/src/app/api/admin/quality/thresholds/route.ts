import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

type ThresholdBody = {
  abstention_drop_pct?: number
  low_rating_pct?: number
  miss_daily_count?: number
  unused_memory_pct?: number
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireOwner()
  if (isErrorResponse(ctx)) return ctx
  const { actorId, serviceClient } = ctx

  const body = await req.json() as ThresholdBody

  const updates: { key: string; value: number }[] = []

  if (body.abstention_drop_pct !== undefined) {
    const v = Number(body.abstention_drop_pct)
    if (!isFinite(v) || v < 0 || v > 100) return NextResponse.json({ error: 'abstention_drop_pct must be 0–100' }, { status: 400 })
    updates.push({ key: 'quality_abstention_drop_threshold_pct', value: v })
  }
  if (body.low_rating_pct !== undefined) {
    const v = Number(body.low_rating_pct)
    if (!isFinite(v) || v < 0 || v > 100) return NextResponse.json({ error: 'low_rating_pct must be 0–100' }, { status: 400 })
    updates.push({ key: 'quality_low_rating_alert_pct', value: v })
  }
  if (body.miss_daily_count !== undefined) {
    const v = Number(body.miss_daily_count)
    if (!isFinite(v) || v < 0) return NextResponse.json({ error: 'miss_daily_count must be >= 0' }, { status: 400 })
    updates.push({ key: 'quality_miss_daily_alert_count', value: v })
  }
  if (body.unused_memory_pct !== undefined) {
    const v = Number(body.unused_memory_pct)
    if (!isFinite(v) || v < 0 || v > 100) return NextResponse.json({ error: 'unused_memory_pct must be 0–100' }, { status: 400 })
    updates.push({ key: 'quality_unused_memory_alert_pct', value: v })
  }

  if (updates.length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })

  for (const { key, value } of updates) {
    const { error } = await serviceClient
      .from('system_config')
      .update({ value, updated_by: actorId, updated_at: new Date().toISOString() })
      .eq('key', key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
