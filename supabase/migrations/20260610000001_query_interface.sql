-- Issue #10 — Query Interface: seed user query agent config + wire tool input_schemas
-- Idempotent: safe to re-run.

-- ── 1. Update tool input_schemas (currently all '{}' — Anthropic requires type:object) ──

UPDATE tools SET input_schema = '{
  "type": "object",
  "properties": {
    "query_text": {
      "type": "string",
      "description": "The natural language query to search for in organisational memory"
    },
    "namespaces": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional namespace filter, e.g. [\"org\"] or [\"org\", \"client:acme\"]. Defaults to [\"org\"] if omitted."
    }
  },
  "required": ["query_text"]
}'::jsonb WHERE name = 'search_memory';

UPDATE tools SET input_schema = '{
  "type": "object",
  "properties": {
    "message_id": {
      "type": "string",
      "description": "The Gmail message ID to fetch. Retrieve this from a prior search or history lookup."
    }
  },
  "required": ["message_id"]
}'::jsonb WHERE name = 'fetch_gmail';

UPDATE tools SET input_schema = '{
  "type": "object",
  "properties": {
    "file_id": {
      "type": "string",
      "description": "The Google Drive file ID to fetch content from. Text files are returned as plain text; binary files return metadata only."
    }
  },
  "required": ["file_id"]
}'::jsonb WHERE name = 'fetch_drive_file';

UPDATE tools SET input_schema = '{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Drive API search query using Drive query syntax, e.g. \"name contains ''report''\" or \"modifiedTime > ''2026-01-01''\""
    }
  },
  "required": ["query"]
}'::jsonb WHERE name = 'search_drive';

UPDATE tools SET input_schema = '{
  "type": "object",
  "properties": {
    "claim": {
      "type": "string",
      "description": "The durable statement to store as a memory. Write in present tense as a standalone fact."
    },
    "suggested_type": {
      "type": "string",
      "enum": ["episodic", "semantic", "procedural"],
      "description": "episodic=event record, semantic=durable fact/preference/relationship, procedural=SOP/how-to"
    },
    "confidence": {
      "type": "number",
      "description": "Confidence in this claim being worth storing (0.0–1.0). Use >= 0.7 for direct evidence."
    },
    "sources": {
      "type": "object",
      "description": "Source references this claim was derived from, e.g. { \"email_id\": \"...\", \"drive_file_id\": \"...\" }"
    },
    "entity_refs": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Entity identifiers this memory relates to, e.g. [\"client:acme\", \"project:q2-launch\"]"
    }
  },
  "required": ["claim", "suggested_type", "confidence"]
}'::jsonb WHERE name = 'propose_memory';

UPDATE tools SET input_schema = '{
  "type": "object",
  "properties": {
    "to": { "type": "string", "description": "Recipient email address" },
    "subject": { "type": "string", "description": "Email subject line" },
    "body": { "type": "string", "description": "Email body (plain text)" }
  },
  "required": ["to", "subject", "body"]
}'::jsonb WHERE name = 'create_gmail_draft';

UPDATE tools SET input_schema = '{
  "type": "object",
  "properties": {
    "to": { "type": "string", "description": "Recipient email address" },
    "subject": { "type": "string", "description": "Email subject line" },
    "body": { "type": "string", "description": "Email body (plain text)" }
  },
  "required": ["to", "subject", "body"]
}'::jsonb WHERE name = 'send_email';

UPDATE tools SET input_schema = '{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "File name including extension" },
    "content": { "type": "string", "description": "File content as plain text" },
    "mime_type": { "type": "string", "description": "MIME type, e.g. text/plain or text/markdown" }
  },
  "required": ["name", "content"]
}'::jsonb WHERE name = 'create_drive_file';

UPDATE tools SET input_schema = '{
  "type": "object",
  "properties": {
    "file_id": { "type": "string", "description": "The Google Drive file ID to update" },
    "content": { "type": "string", "description": "New file content as plain text" }
  },
  "required": ["file_id", "content"]
}'::jsonb WHERE name = 'update_drive_file';

-- ── 2. Seed user query agent config ──────────────────────────────────────────

INSERT INTO agent_configs (
  id, name, description, system_prompt, model, tool_ids, required_role, is_active, version
) VALUES (
  '20000000-0000-0000-0000-000000000005',
  'system.query.user',
  'User-facing query agent — answers natural language questions with provenance labels',
  'You are the AI Business Brain — an organisational memory system. You help the team query what the business knows: decisions, client preferences, lessons, SOPs, and relationships.

ALWAYS start by calling search_memory with the user''s question to check what the organisation already knows. If memories are sparse or absent, check live sources with fetch_gmail, search_drive, or fetch_drive_file.

Label every claim in your response with its provenance:
- "I know this" — from a memory record (cite the source ref and date)
- "This is live" — fetched right now from Gmail or Google Drive
- "Couldn''t reach source" — live fetch failed (show last-known value + timestamp if available)
- "General inference, not from your business" — your own reasoning, not derived from business data. Always render this visually distinct and never present it as a business fact.

ABSTENTION RULE: If search_memory returns no relevant results and live sources also return nothing useful, respond with exactly this format:
"I don''t have durable knowledge on this. Here''s what the systems of record show: [summarise what live sources returned, or ''nothing found'' if empty]. Want me to capture an answer if someone knows?"

MEMORY PROPOSAL RULE: When you encounter a new durable fact in the conversation — a decision and its reasoning, a client preference, a lesson learned, an SOP — call propose_memory to capture it. Do not propose things already in memory. Do not propose transient current-state data (dates, statuses, pipeline values) — those belong in systems of record.

ABSTAIN rather than confabulate. Every claim must be traceable to a source. If you are uncertain, say so explicitly.',
  'claude-sonnet-4-6',
  '["30000000-0000-0000-0000-000000000001","30000000-0000-0000-0000-000000000002","30000000-0000-0000-0000-000000000003","30000000-0000-0000-0000-000000000004","30000000-0000-0000-0000-000000000005"]'::jsonb,
  'Member',
  true,
  1
) ON CONFLICT (id) DO NOTHING;
