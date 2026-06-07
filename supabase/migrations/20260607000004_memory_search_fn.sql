-- Memory hybrid search function — RRF fusion of keyword + vector search.
-- Permissions enforced via explicit parameters, never post-filtered.
-- SECURITY DEFINER so it can call sensitivity_to_level() and bypass RLS;
-- callers MUST supply correct clearance/zones from the application layer.

CREATE OR REPLACE FUNCTION search_memories_hybrid(
  p_embedding     vector(1024),
  p_query_text    text,
  p_clearance     int,
  p_zones         text[],
  p_namespaces    text[],
  p_floor         float8,
  p_max_results   int
)
RETURNS TABLE (
  id                    uuid,
  type                  text,
  content               text,
  source_refs           jsonb,
  author_type           text,
  author_id             uuid,
  agent_task_id         uuid,
  status                text,
  valid_from            timestamptz,
  valid_to              timestamptz,
  sensitivity_level     text,
  zone                  text,
  namespace             text,
  retrieval_count       int,
  last_retrieved_at     timestamptz,
  utility_score         float,
  content_hash          text,
  embedding_model       text,
  embedding_model_version text,
  created_at            timestamptz,
  updated_at            timestamptz,
  similarity_score      float8
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH keyword_results AS (
    SELECT
      m.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(m.search_vector, plainto_tsquery('english', p_query_text)) DESC
      ) AS rank
    FROM memories m
    WHERE m.status = 'active'
      AND m.search_vector @@ plainto_tsquery('english', p_query_text)
      AND sensitivity_to_level(m.sensitivity_level) <= p_clearance
      AND (m.zone IS NULL OR m.zone = ANY(p_zones))
      AND m.namespace = ANY(p_namespaces)
    LIMIT 100
  ),
  vector_results AS (
    SELECT
      m.id,
      ROW_NUMBER() OVER (ORDER BY m.embedding <=> p_embedding) AS rank,
      1.0 - (m.embedding <=> p_embedding)                      AS cosine_sim
    FROM memories m
    WHERE m.status = 'active'
      AND m.embedding IS NOT NULL
      AND sensitivity_to_level(m.sensitivity_level) <= p_clearance
      AND (m.zone IS NULL OR m.zone = ANY(p_zones))
      AND m.namespace = ANY(p_namespaces)
    ORDER BY m.embedding <=> p_embedding
    LIMIT 100
  ),
  rrf_scores AS (
    SELECT
      COALESCE(k.id, v.id)                                                        AS id,
      COALESCE(1.0 / (60.0 + k.rank), 0.0) + COALESCE(1.0 / (60.0 + v.rank), 0.0) AS rrf_score,
      COALESCE(v.cosine_sim, 0.0)                                                 AS similarity_score
    FROM keyword_results k
    FULL OUTER JOIN vector_results v ON k.id = v.id
  )
  SELECT
    m.id, m.type, m.content, m.source_refs,
    m.author_type, m.author_id, m.agent_task_id,
    m.status, m.valid_from, m.valid_to,
    m.sensitivity_level, m.zone, m.namespace,
    m.retrieval_count, m.last_retrieved_at,
    m.utility_score, m.content_hash,
    m.embedding_model, m.embedding_model_version,
    m.created_at, m.updated_at,
    r.similarity_score
  FROM rrf_scores r
  JOIN memories m ON m.id = r.id
  WHERE r.similarity_score >= p_floor
  ORDER BY r.rrf_score DESC
  LIMIT p_max_results;
$$;

REVOKE EXECUTE ON FUNCTION search_memories_hybrid(vector, text, int, text[], text[], float8, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION search_memories_hybrid(vector, text, int, text[], text[], float8, int) TO authenticated, service_role;

-- Atomically increments retrieval_count and sets last_retrieved_at on a batch of memories.
-- Called after a successful hybrid search; fire-and-forget from the application layer.
CREATE OR REPLACE FUNCTION increment_retrieval_counts(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE memories
  SET
    retrieval_count    = retrieval_count + 1,
    last_retrieved_at  = now()
  WHERE id = ANY(p_ids);
$$;

REVOKE EXECUTE ON FUNCTION increment_retrieval_counts(uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_retrieval_counts(uuid[]) TO authenticated, service_role;
