import { createHash } from 'crypto'
import type { SupabaseClient } from '../supabase/client.js'
import type { MemoryType, SensitivityLevel, AuthorType } from '../schemas/index.js'
import { generateEmbedding, EMBEDDING_MODEL, EMBEDDING_MODEL_VERSION } from './embed.js'

export async function writeMemory(params: {
  type: MemoryType
  content: string
  sourceRefs: Record<string, unknown>
  authorType: AuthorType
  authorId: string
  agentTaskId?: string
  sensitivityLevel: SensitivityLevel
  zone?: string
  namespace: string
  supersedingId?: string
  serviceClient: SupabaseClient
}): Promise<{ id: string; skipped: boolean }> {
  const {
    type, content, sourceRefs, authorType, authorId,
    agentTaskId, sensitivityLevel, zone, namespace,
    supersedingId, serviceClient,
  } = params

  const normalised = content.trim()
  const contentHash = createHash('sha256').update(normalised).digest('hex')

  // Tier-1 dedup: skip if an active record with this hash already exists.
  const { data: existing } = await serviceClient
    .from('memories')
    .select('id')
    .eq('content_hash', contentHash)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) return { id: existing.id, skipped: true }

  // Invalidate-don't-overwrite: set old record to invalidated before writing new.
  if (supersedingId) {
    await invalidateMemory({ id: supersedingId, serviceClient })
  }

  const embedding = await generateEmbedding(normalised)

  const { data: inserted, error } = await serviceClient
    .from('memories')
    .insert({
      type,
      content: normalised,
      embedding: embedding as unknown as string, // pgvector accepts number[] via PostgREST
      source_refs: sourceRefs,
      author_type: authorType,
      author_id: authorId,
      agent_task_id: agentTaskId ?? null,
      status: 'active',
      valid_from: new Date().toISOString(),
      valid_to: null,
      sensitivity_level: sensitivityLevel,
      zone: zone ?? null,
      namespace,
      retrieval_count: 0,
      last_retrieved_at: null,
      utility_score: null,
      content_hash: contentHash,
      embedding_model: EMBEDDING_MODEL,
      embedding_model_version: EMBEDDING_MODEL_VERSION,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    throw new Error(`Failed to write memory: ${error?.message}`)
  }

  return { id: inserted.id, skipped: false }
}

export async function invalidateMemory(params: {
  id: string
  serviceClient: SupabaseClient
}): Promise<void> {
  const { id, serviceClient } = params
  const { error } = await serviceClient
    .from('memories')
    .update({ status: 'invalidated', valid_to: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Failed to invalidate memory ${id}: ${error.message}`)
}
