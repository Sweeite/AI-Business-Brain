import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'
import { generateEmbedding, EMBEDDING_MODEL, EMBEDDING_MODEL_VERSION } from '@brain/core'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOwner()
  if (isErrorResponse(auth)) return auth

  const { id } = await params
  const { actorId, serviceClient } = auth

  const body = await req.json() as { content?: string }
  const newContent = body.content?.trim()
  if (!newContent) return NextResponse.json({ error: 'content is required' }, { status: 400 })

  const { data: memory, error: fetchError } = await serviceClient
    .from('memories')
    .select('id, type, content, content_hash, source_refs, author_type, author_id, agent_task_id, sensitivity_level, zone, namespace, status')
    .eq('id', id)
    .single()

  if (fetchError || !memory) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
  }
  if (memory.status === 'invalidated') {
    return NextResponse.json({ error: 'Cannot edit an invalidated memory' }, { status: 400 })
  }

  const newHash = createHash('sha256').update(newContent).digest('hex')
  if (newHash === memory.content_hash) {
    return NextResponse.json({ error: 'Content is unchanged' }, { status: 400 })
  }

  const embedding = await generateEmbedding(newContent)
  const now = new Date().toISOString()
  const newId = crypto.randomUUID()

  const { error: invalidateError } = await serviceClient
    .from('memories')
    .update({ status: 'invalidated', valid_to: now })
    .eq('id', id)

  if (invalidateError) return NextResponse.json({ error: invalidateError.message }, { status: 500 })

  const { error: insertError } = await serviceClient
    .from('memories')
    .insert({
      id: newId,
      type: memory.type,
      content: newContent,
      content_hash: newHash,
      embedding: JSON.stringify(embedding),
      embedding_model: EMBEDDING_MODEL,
      embedding_model_version: EMBEDDING_MODEL_VERSION,
      source_refs: memory.source_refs,
      author_type: memory.author_type,
      author_id: memory.author_id,
      agent_task_id: memory.agent_task_id,
      sensitivity_level: memory.sensitivity_level,
      zone: memory.zone,
      namespace: memory.namespace,
      status: 'active',
      valid_from: now,
      valid_to: null,
      retrieval_count: 0,
      last_retrieved_at: null,
      utility_score: 0,
    })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  await serviceClient.from('audit_log').insert([
    {
      id: crypto.randomUUID(),
      action_type: 'memory_invalidated',
      actor_id: actorId,
      actor_type: 'human',
      target_type: 'memory',
      target_id: id,
      metadata: { memory_id: id, reason: 'edited', replaced_by: newId },
    },
    {
      id: crypto.randomUUID(),
      action_type: 'memory_created',
      actor_id: actorId,
      actor_type: 'human',
      target_type: 'memory',
      target_id: newId,
      metadata: { memory_id: newId, replaces: id },
    },
  ])

  return NextResponse.json({ ok: true, newId })
}
