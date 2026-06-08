import { NextRequest, NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

const LEVEL_MAP: Record<string, number> = {
  public: 1,
  internal: 2,
  management: 3,
  leadership: 4,
}

const VALID_LEVELS = ['public', 'internal', 'management', 'leadership']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if (isErrorResponse(auth)) return auth

  const { id } = await params
  const { actorId, serviceClient } = auth

  const body = await req.json() as { sensitivity_level?: string }
  const newLevel = body.sensitivity_level
  if (!newLevel || !VALID_LEVELS.includes(newLevel)) {
    return NextResponse.json({ error: 'Invalid sensitivity_level' }, { status: 400 })
  }

  const { data: memory, error: fetchError } = await serviceClient
    .from('memories')
    .select('id, sensitivity_level, status')
    .eq('id', id)
    .single()

  if (fetchError || !memory) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
  }

  const currentLevelNum = LEVEL_MAP[memory.sensitivity_level] ?? 2
  const newLevelNum = LEVEL_MAP[newLevel]

  if (newLevelNum >= currentLevelNum) {
    return NextResponse.json(
      { error: 'New sensitivity_level must be lower (broader) than the current level' },
      { status: 400 }
    )
  }

  const { error: updateError } = await serviceClient
    .from('memories')
    .update({ sensitivity_level: newLevel })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await serviceClient.from('audit_log').insert({
    id: crypto.randomUUID(),
    action_type: 'memory_sensitivity_broadened',
    actor_id: actorId,
    actor_type: 'human',
    target_type: 'memory',
    target_id: id,
    metadata: {
      memory_id: id,
      old_level: memory.sensitivity_level,
      new_level: newLevel,
    },
  })

  return NextResponse.json({ ok: true })
}
