import type { SupabaseClient } from '../supabase/client.js'
import type { Memory } from '../db/types.js'
import { generateEmbedding } from './embed.js'

export interface RetrievalContext {
  clearanceLevel: number   // 1=public, 2=internal, 3=management, 4=leadership
  zones: string[]          // zone names the user can access (empty = zone=NULL only)
  namespaces: string[]     // e.g. ['org'] or ['org', 'client:acme']
}

const DEFAULT_FLOOR = 0.72
const DEFAULT_MAX = 20

export async function retrieveMemories(params: {
  queryText: string
  queryEmbedding?: number[]
  context: RetrievalContext
  serviceClient: SupabaseClient
}): Promise<Memory[]> {
  const { queryText, context, serviceClient } = params

  try {
    // Read thresholds from system_config; fall back to defaults on failure.
    let floor = DEFAULT_FLOOR
    let maxResults = DEFAULT_MAX
    try {
      const { data: configs } = await serviceClient
        .from('system_config')
        .select('key, value')
        .in('key', ['retrieval_min_relevance', 'retrieval_max_results'])
      if (configs) {
        for (const row of configs) {
          if (row.key === 'retrieval_min_relevance') floor = Number(row.value) || DEFAULT_FLOOR
          if (row.key === 'retrieval_max_results') maxResults = Number(row.value) || DEFAULT_MAX
        }
      }
    } catch {
      // Non-fatal: use defaults
    }

    // Generate embedding if not pre-supplied.
    let embedding: number[]
    try {
      embedding = params.queryEmbedding ?? await generateEmbedding(queryText)
    } catch {
      return [] // Embedding failure → fail-closed
    }

    const { data, error } = await serviceClient.rpc('search_memories_hybrid', {
      p_embedding: embedding as unknown as string,
      p_query_text: queryText,
      p_clearance: context.clearanceLevel,
      p_zones: context.zones,
      p_namespaces: context.namespaces,
      p_floor: floor,
      p_max_results: maxResults,
    })

    if (error || !data) return []

    const rows = data as RpcMemoryRow[]
    const memories: Memory[] = rows.map(rowToMemory)

    // Fire-and-forget retrieval tracking — never blocks results.
    if (memories.length > 0) {
      const ids = memories.map((m) => m.id)
      void (async () => {
        try {
          await serviceClient.rpc('increment_retrieval_counts', { p_ids: ids })
        } catch {
          // Tracking failure is non-fatal; retrieval results are already returned.
        }
      })()
    }

    return memories
  } catch {
    return [] // Any unexpected error → fail-closed
  }
}

// ── RPC row shape (no embedding or search_vector returned) ────────────────────

interface RpcMemoryRow {
  id: string
  type: string
  content: string
  source_refs: Record<string, unknown>
  author_type: string
  author_id: string
  agent_task_id: string | null
  status: string
  valid_from: string
  valid_to: string | null
  sensitivity_level: string
  zone: string | null
  namespace: string
  retrieval_count: number
  last_retrieved_at: string | null
  utility_score: number | null
  content_hash: string
  embedding_model: string
  embedding_model_version: string
  created_at: string
  updated_at: string
  similarity_score: number
}

function rowToMemory(row: RpcMemoryRow): Memory {
  return {
    id: row.id,
    type: row.type as Memory['type'],
    content: row.content,
    embedding: null,
    search_vector: null,
    source_refs: row.source_refs,
    author_type: row.author_type as Memory['author_type'],
    author_id: row.author_id,
    agent_task_id: row.agent_task_id,
    status: row.status as Memory['status'],
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    sensitivity_level: row.sensitivity_level as Memory['sensitivity_level'],
    zone: row.zone,
    namespace: row.namespace,
    retrieval_count: row.retrieval_count,
    last_retrieved_at: row.last_retrieved_at,
    utility_score: row.utility_score,
    content_hash: row.content_hash,
    embedding_model: row.embedding_model,
    embedding_model_version: row.embedding_model_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
