# AI Business Brain — Product Requirements Document

> **Audience: Claude Code (the builder).** This is the single source of truth for what to build.
> Everything in this document has been deliberately decided. Build exactly this.
> Do not add features, abstractions, or complexity beyond what is specified.

---

## 0. Vision

An AI Business Brain that follows everyone in a business everywhere — meetings, emails, chats, documents, systems. It remembers what humans do and decide without duplicating data that already lives in existing systems. When someone leaves, their knowledge and IP stays. Handover is easy. Decisions are queryable. New hires get up to speed by asking questions.

It is the Jarvis for the business. Because it learns so much, it becomes proactive — preparing for meetings, generating reports, surfacing what matters. It is the system that allows a founder to take a 7-week holiday and nothing breaks. It is the answer to businesses wanting to trigger agents to do things for them.

**Sold as a boilerplate by an AI agency.** One deployment per business client. No multi-tenancy. 10–70 people per deployment.

---

## 1. What It Is and Is Not

**Is:**
- Durable, queryable organisational memory
- The "person who remembers everything"
- Captures perishable, in-people's-heads knowledge: decisions + why, client preferences, sentiment, lessons, SOPs, relationships
- Queryable by humans and agents
- Permission-safe — the right person sees the right thing

**Is not:**
- A copy of the CRM, ERP, or any system of record
- A replacement for existing business tools
- A system that remembers everything (unbounded memory degrades quality)

**The core rule:**
> Materialise into memory ONLY if (a) it is NOT already a field in a system of record AND (b) it has lasting interpretive value. Everything that is current-state structured data is fetched LIVE as a tool call. On conflict, the system of record always wins.

**Three principles that drive all design decisions:**
1. These systems fail silently — fluent, confident, and wrong while quality erodes. Observability and quality monitoring are first-class requirements.
2. The dominant risk is over-sharing, not bad answers — showing the right data to the wrong person. Permission-aware retrieval, fail-closed, outranks almost everything.
3. Unbounded memory is a correctness problem — decay, tight retrieval, and selective writing are mandatory.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| **Framework** | Next.js 14 (TypeScript, App Router) | Full-stack, UI + API routes in one codebase |
| **Hosting** | Railway | Two services: `app` (Next.js) and `worker` (background jobs). No Vercel — timeout limits make it unsuitable for long-running jobs |
| **Database** | Supabase (Postgres) | Structured data, metadata, ACLs, audit logs, all relational data |
| **Vector search** | pgvector via Supabase | Sufficient for 10–70 people. No separate vector DB needed |
| **Auth** | Supabase Auth | Google OAuth primary. Email/password fallback for deployments without Google Workspace |
| **File storage** | Supabase Storage | Documents, transcripts, attachments |
| **Job queue + cron** | pg-boss | Postgres-native, runs in the worker service, handles all background jobs and scheduled tasks |
| **LLM** | Anthropic Claude | claude-sonnet-4-6 default. Model is configurable per agent as data (not hardcoded) |
| **Embeddings** | Voyage AI | voyage-3 model. Best retrieval quality |
| **UI components** | shadcn/ui + Tailwind CSS | Dashboards, query interface, workflow builder |
| **Credential vault** | Supabase Vault | All secrets stored here. Never in the connections table or environment variables |
| **Containerisation** | Docker | One image per service. Each client gets their own Railway deployment running these images, configured via environment variables. |

**Railway service structure:**
```
app/      → Next.js (UI + short API calls, user-facing)
worker/   → Node.js (ingestion, cron, memory writes, connector sync, job queue)
```

**Deployment model — one codebase, isolated per-client instances:**

The agency maintains a single codebase. Each client gets their own isolated deployment:
- One Railway project (runs the `app` and `worker` Docker images)
- One Supabase project (their data, fully isolated)
- All per-client configuration via environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, etc.)

Deploying a new client = spin up a new Railway project + new Supabase project + set env vars. No code changes. No separate branches. The Docker images are built from this repo and deployed to each client's Railway project.

**Monorepo package structure:**
```
packages/
  app/     → Next.js service. Owns: pages, UI components, API route handlers, webhook receivers (verify + enqueue only).
  worker/  → Node.js service. Owns: pg-boss setup, all job handlers, connector sync logic, cron implementations.
  core/    → Shared library. Imported by both app and worker. Never deployed independently.
```

**`packages/core` contains exactly:**

| What | Why |
|---|---|
| TypeScript DB types (generated from schema) | Both services query the DB |
| `executeAgent()` function | Worker runs it for cron/webhooks; app runs it for user queries |
| Memory retrieval logic (hybrid search + RRF fusion) | Called inside `executeAgent()` |
| Supabase client factory | Both services connect to the same DB |
| Routing decision tree pipeline | Worker runs it during ingestion |
| Permission resolution logic | Enforced identically in both services |
| Zod schemas for all shared types | Consistent validation across the boundary |

Nothing else goes in `core`. If only one service needs it, it lives in that service's package.

**Per client deployment:** one Railway project + one Supabase project. Clean isolation per business.

---

## 3. Architecture Overview

```
[External Tools] → [Connectors] → [Ingestion Queue] → [Routing Decision Tree]
                                                              ↓
                                              [Memory Store] ← [Write Pipeline]
                                              [RAG / Vector]
                                                    ↓
[User / Agent] → [Query Interface] → [executeAgent()] → [Response + Provenance Labels]
                                            ↓
                              [Tool Calls] [Memory Reads] [Memory Proposals]
                                            ↓
                                    [Audit Log] [Cost Tracking] [Feedback Signals]
```

**The single execution layer — the most important architectural decision:**

Everything runs through one function:

```typescript
executeAgent({
  user: User,
  systemPrompt: string,       // loaded from DB, not hardcoded
  tools: Tool[],              // read and write tools, permission-checked
  memoryContext: Memory[],    // retrieved, permission-filtered
  triggerContext: object,     // what triggered this (user query, cron, webhook)
  permissions: Permission[],  // the acting user's resolved permissions
}): Promise<AgentResult>
```

Every query, every cron job, every proactive routine, every agent run goes through this function. This is what makes Phase 3 (autonomous agents) additive rather than a rewrite — you just change what calls `executeAgent`.

---

## 4. Memory System

### 4.1 Memory Types

One Postgres table with a `type` column. Do not build separate stores per type.

| Type | Holds | Example | Persisted? |
|---|---|---|---|
| **Working** | Live conversation context, current task | The question being answered right now | Never |
| **Episodic** | Records of events — what happened, when, who | A client call on May 3rd, a decision made in a meeting | Yes |
| **Semantic** | Durable facts, entities, relationships, decisions | "Client X prefers monthly reporting", "We discount this vertical 15%" | Yes |
| **Procedural** | How-to, playbooks, SOPs, rules | "How we onboard a retainer client", "Standard proposal process" | Yes |

**Namespaces** scope memory retrieval to a specific context. Three valid values in Phase 1:

| Namespace | Meaning | Who sets it |
|---|---|---|
| `org` | Applies to the whole organisation. Default for all writes. | Automatic — the default. |
| `client:{id}` | Specific to one client. Prevents client A's preferences bleeding into answers about client B. | Agent or operator, derived from entity refs in the proposal. |
| `project:{id}` | Specific to one project or engagement. | Agent or operator, derived from entity refs. |

Retrieval always scopes by namespace — a query about Client Acme retrieves `org` and `client:acme` memories only, never `client:otherco`. Namespace is orthogonal to the clearance ladder and confidentiality zones — all three filters apply simultaneously. No namespaces beyond these three are supported in Phase 1.

### 4.2 Memory Record Schema

```typescript
memory {
  id: uuid
  type: 'episodic' | 'semantic' | 'procedural'
  content: text                    // the durable statement
  embedding: vector(1024)          // Voyage AI embedding
  
  // Provenance
  source_refs: jsonb               // doc IDs, email IDs, meeting IDs, agent task IDs
  author_type: 'human' | 'agent'
  author_id: uuid                  // user_id or agent_id
  agent_task_id: uuid | null
  
  // Lifecycle
  status: 'active' | 'invalidated'
  valid_from: timestamptz
  valid_to: timestamptz | null     // set when invalidated
  created_at: timestamptz
  
  // Permissions (clearance ladder model)
  sensitivity_level: 'public' | 'internal' | 'management' | 'leadership'
  zone: text | null                // optional confidentiality zone e.g. 'client-acme'
  
  // Self-improvement signals
  retrieval_count: integer         // how many times retrieved
  last_retrieved_at: timestamptz
  utility_score: float             // computed from feedback
  
  // Config as data
  namespace: text                  // default: 'org', or per client/project
  
  // Dedup
  content_hash: text               // SHA-256 of normalised content
  
  // Embedding versioning
  embedding_model: text            // e.g. 'voyage-3'
  embedding_model_version: text
}
```

### 4.3 Invalidate-Don't-Overwrite

When a fact changes, **never overwrite**. Set `valid_to = now()` and `status = 'invalidated'` on the old record. Write a new record. The history is always preserved.

### 4.4 Memory Consolidation

A cron job (configurable cadence, default: nightly 2am) distils episodic events into semantic facts.

```
episodic: "In the May 3 call, client said they prefer async updates"
    ↓ consolidation cron
semantic: "Client X prefers async updates over calls"
```

The raw episodic record is never deleted — the semantic fact points back to it via `source_refs`.

**Duplicate prevention — two guards applied on every run:**

1. **Episodic watermark:** The job records its last-processed timestamp in `system_config` (`consolidation_last_run_at`). Each run only considers episodic memories created *after* that watermark. Already-consolidated events are never reprocessed.

2. **Semantic similarity check before commit:** Before writing a new semantic memory, run a vector similarity search against all active semantic memories in the same namespace. If any existing memory scores above the dedup threshold (`consolidation_dedup_similarity_threshold`, default: `0.92`), treat the candidate as a near-duplicate — route to the human review queue rather than auto-committing. Exact duplicates are caught earlier by `content_hash`.

The watermark is updated at the end of each successful run, not the start — a failed run reprocesses from the previous watermark rather than skipping events.

### 4.5 Decay

A cron job (configurable cadence, default: weekly) recomputes `utility_score` on all active memories, then invalidates those below the configured threshold.

**Utility score formula** (computed by the decay cron, not on every write):

```
utility_score =
  (retrieval_recency_score × 0.4)    -- exponential decay from last_retrieved_at
  + (retrieval_frequency_score × 0.3) -- log-scaled retrieval_count
  + (feedback_score × 0.3)            -- +1 per thumbs up, -1 per thumbs down / wrong / stale
```

- `retrieval_recency_score`: `exp(-days_since_last_retrieval / 90)` — halves roughly every 62 days of non-use.
- `retrieval_frequency_score`: `min(1.0, log(retrieval_count + 1) / log(50))` — saturates at 50 retrievals.
- `feedback_score`: `clamp((positive_signals - negative_signals) / max(total_signals, 1), -1, 1)` mapped to 0.0–1.0.

Scores range 0.0–1.0. Decay threshold and TTL are stored in `system_config`:

| Key | Default | Description |
|---|---|---|
| `decay_min_utility_score` | `0.2` | Invalidate if score below this |
| `decay_min_age_days` | `30` | Only decay memories older than this |
| `decay_cron_schedule` | `0 3 * * 0` | Weekly Sunday 3am |

Changing any decay setting that affects answer quality requires admin approval in the self-improvement dashboard before it takes effect (§11.4).

### 4.6 Retrieval

- **Hybrid retrieval:** Postgres `tsvector` keyword search + pgvector dense search, fused with RRF
- **Permission-filtered at the vector layer, fail-closed** — never retrieve-then-filter
- **Dynamic retrieval with a hard cap:** retrieve all memories above the relevance floor, up to the max results limit. RRF fusion is applied across both legs before the floor check.
- **Namespace-scoped:** every retrieval query filters by the relevant namespace(s) (e.g. `org` + `client:acme` for a client-specific query). Namespace is resolved from the query context before retrieval — never post-filtered.
- **Provenance + freshness label on every retrieved piece**
- **Zero results below floor → abstain.** Never inject low-confidence memories to avoid an abstention.

Retrieval is controlled by two `system_config` keys:

| Key | Default | Description |
|---|---|---|
| `retrieval_min_relevance` | `0.72` | Cosine similarity floor. Memories below this score are never injected. |
| `retrieval_max_results` | `20` | Hard cap on memories injected per query, even if more clear the floor. |

Both values are tunable by the self-improvement loop (§11) and require admin approval before changing.

---

## 5. Routing Decision Tree

Every piece of incoming content runs through these gates **in order**. Stop at first match.

```
1. SENSITIVE / EXCLUDED?
   Source is on do-not-ingest list (HR mailbox, /Legal, #personal)?
     YES → DROP. Never indexed, never stored.
   Content has sensitivity label (e.g. MS sensitivity label, manual tag)?
     YES → DROP or ROUTE TO REVIEW QUEUE.
   
2. CURRENT-STATE STRUCTURED FACT?
   Only runs for structured connectors. Unstructured connectors (Gmail, Google Drive) skip this gate entirely — their connector_schemas are empty by default and all their content is treated as interpretive.

   Structured connectors (CRM, task manager, etc.) tag every ingested item with field metadata:
     { field: 'deal_stage', value: 'Proposal', connector_type: 'ghl' }
   Gate 2 checks if `field` exists in the connector_schemas row for that connector_type.
   This is a deterministic lookup — no LLM call, ever.
     YES → FETCH LIVE. Never copy into memory.

3. LASTING INTERPRETIVE VALUE?
   Is this a decision + why, a preference, sentiment, a lesson, a relationship, an SOP?
     NO  → INDEX-IN-PLACE (see below)
     YES → continue to gate 4
     UNSURE → INDEX-IN-PLACE (safe default, never auto-promote uncertain content)

   **INDEX-IN-PLACE defined:** The content is chunked, embedded, and written to the `chunks` table — not the `memories` table. It is searchable via the same hybrid retrieval pipeline but carries none of the memory lifecycle (no status, no utility score, no invalidation, no sensitivity_level inheritance). In query responses it is labelled `"I found this in [source]"` not `"I know this"`. Chunks are never consolidated or decayed by utility score. They are pruned by a simple age-based TTL (`chunk_ttl_days`, default: 90 days).

4. ALSO A STRUCTURED ACTION?
   Does this produce an action item with an owner + date, a new contact, a pipeline change?
     YES → BOTH: write structured part to the SoR (Asana task, GHL contact)
                 AND write an episodic memory of where it came from
     NO  → WRITE TO MEMORY (pick type from §4.1)

AFTER ANY WRITE:
  - Attach provenance (source refs, author, timestamp)
  - Set sensitivity_level = highest of all source levels
  - Set zone = union of all source zones
  - Check content_hash — if exists, skip (tier-1 dedup)
  - If supersedes an older fact, invalidate the old record (§4.3)

AT EVERY RETRIEVAL:
  - Enforce permissions at query time, fail-closed
  - Label provenance + freshness in the output
```

### 5.1 Output Provenance Labels

Every answer must visibly tag where each part came from:
- **"I know this"** — from memory (show source + as-of date)
- **"This is live"** — from a system of record right now
- **"Couldn't reach source"** — live fetch failed (show last-known with timestamp)
- **"General inference, not from your business"** — rendered visually distinct, never presented as a business fact

The brain **abstains** rather than confabulates. If nothing clears the relevance floor, the response is: *"I don't have durable knowledge on this. Here's what the systems of record show: [...]. Want me to capture an answer if someone knows?"*

Every abstention is logged as a miss — this is your best signal for what to learn next.

---

## 6. Connectors

### 6.1 Connector Capability Interface

Every connector declares its capabilities. Core brain logic stays constant. Do not hardcode any connector's behaviour in core logic.

| Capability | Question | Fallback |
|---|---|---|
| **Intake** | Streams history + ongoing data? | Manual signal only |
| **Schema** | Exposes queryable schema? | Treat all content as interpretive |
| **Write-back** | Accepts writes + returns a durable tag? | Provenance + dedup only |
| **ACL sync** | Pushes permission changes via webhook? | Scheduled full refresh |
| **Identity** | Provides stable per-principal ID? | Deterministic match only |
| **Connection scope** | `org` or `per-user`? | Default `org` |
| **Delegated access** | Returns user-scoped view (call-as-user)? | Org token + brain-side ACL filter |

### 6.2 Connection Ownership

Two tiers:
- **Company-wide (org):** one shared connection for the whole business. E.g. CRM, shared Slack workspace. Credentials stored once.
- **Per-user:** each person's own connection. E.g. personal Gmail, personal Google Drive. One credential row per user.

**Connection scope ≠ data visibility.** An org-wide connection ingests broadly, but each user only sees what their permissions allow.

### 6.3 Connections Table

```typescript
connection {
  id: uuid
  connector_type: string            // 'gmail' | 'google_drive' | 'slack' | 'ghl' etc.
  scope: 'org' | 'per-user'
  owner_user_id: uuid | null        // null if org-wide
  credential_ref: string            // pointer to Supabase Vault, NEVER the secret
  status: 'active' | 'expired' | 'revoked' | 'error'
  granted_scopes: string[]
  last_synced_at: timestamptz
  created_by: uuid
  created_at: timestamptz
}
```

### 6.4 Token Lifecycle

- Secrets stored in Supabase Vault only (`vault.secrets` table). `connections.credential_ref` stores the Vault secret UUID — never the raw token, never the UUID exposed to the client.
- The worker retrieves credentials exclusively via a Postgres RPC function:
  ```sql
  -- SECURITY DEFINER: only callable by the service role, never by client keys
  CREATE FUNCTION get_decrypted_credential(p_connection_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER AS $$
  DECLARE
    v_ref text;
    v_secret text;
  BEGIN
    SELECT credential_ref INTO v_ref FROM connections WHERE id = p_connection_id;
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE id = v_ref::uuid;
    RETURN v_secret;
  END;
  $$;
  ```
  The worker calls this via Supabase client with the service role key: `supabase.rpc('get_decrypted_credential', { p_connection_id })`. Raw secrets never travel through the application layer.
- Auto-refresh job renews tokens before expiry. The refreshed token is written back to Vault via the same service role — the `credential_ref` UUID stays the same, only the secret value changes.
- Per-user connection expiry → degrade for that user + prompt them to reconnect in UI.
- Org-wide connection failure → admin incident alert + loud alarm in system health dashboard.

### 6.5 Schema Discovery

When a connector syncs, it discovers and stores the schema of its system of record — all known fields and their types. This is how the routing decision tree knows whether a piece of content is already a SoR field (gate 2, §5).

```typescript
connector_schema {
  id: uuid
  connector_type: string         // 'gmail' | 'google_drive' | 'ghl' | 'asana' etc.
  schema: jsonb                  // all known fields, types, and descriptions
  last_discovered_at: timestamptz
}
```

Schema is refreshed on every connector sync — automatically picks up new fields without touching prompts or memory. Gate 2 of the routing decision tree checks against this table via a deterministic field lookup, not an LLM call, not a prompt, not procedural memory. This keeps SoR detection fast, cheap, and auditable.

For unstructured connectors (Gmail, Google Drive) the schema is empty by default — Gate 2 is skipped entirely and all content flows through gates 3 and 4.

### 6.6 Phase 1 Connectors

Build these two first. Every subsequent connector follows the same capability interface pattern.

**Gmail**
- Scope: per-user
- Intake: Gmail API, history sync + ongoing via push notifications
- Write-back: create draft, send email (permission-gated)
- ACL: per-user by nature (delegated access)
- Identity: Google account email → Tier-1 deterministic link

**Push notification flow:**

Gmail push notifications are delivered via Google Pub/Sub to a registered webhook URL on the Railway `app` service.

```
POST /api/webhooks/gmail
```

The handler is stateless and does exactly three things — no Gmail API calls, no DB writes:

1. **Verify** the Google Pub/Sub JWT in the `Authorization` header against Google's public keys. Reject with `401` immediately if invalid — do not process.
2. **Decode** the base64 message body to extract `{ userId, historyId }`.
3. **Enqueue** a pg-boss job `gmail.sync` with `{ userId, historyId }`. Return `200`.

All Gmail API calls and ingestion logic happen in the worker, not the webhook handler. The handler must return `200` quickly or Google will retry — enqueue and return, never block.

Google Pub/Sub push subscriptions require a verified domain. The Railway app service's public URL is registered as the push endpoint during connector setup. The JWT verification uses Google's public key endpoint (fetched and cached, not hardcoded).

**Google Drive**
- Scope: per-user (or org with Google Workspace admin)
- Intake: Drive API, file history + ongoing via webhook
- Write-back: create/update files (permission-gated)
- ACL: Drive file permissions synced at ingest time
- Identity: Google account

**Webhook flow:**

Drive webhooks are registered per-user via the Drive API (`files.watch`) and POST change notifications to:

```
POST /api/webhooks/drive
```

The handler follows the same stateless pattern as Gmail — verify the `X-Goog-Channel-Token` header (a secret set at registration time, stored in `system_config`), decode the notification, enqueue a pg-boss job `drive.sync` with `{ userId, resourceId }`, return `200`.

**Webhook expiry:** Drive webhooks expire after a maximum of 7 days. The `connections.webhook_expires_at` column stores the expiry timestamp. The `drive.webhook.renew` daily cron (§10.1) queries all active Drive connections where `webhook_expires_at < now() + interval '48 hours'` and renews them. Renewal failures are surfaced in the System Health dashboard (§12.9) as connector errors — never silently swallowed.

---

## 7. RBAC and Permissions

### 7.1 Two Independent Axes

- **Data visibility** — what a user can *see* (memory clearance, live SoR scoping)
- **Action permissions** — what a user can *do* (configure, write, delete, approve)

Never let "can see a lot" imply "can change things."

### 7.2 Memory Clearance Ladder

An ordered sensitivity model. Every memory record carries a `sensitivity_level`. Users see their level and everything below it.

```
public → internal → management → leadership
```

Default: `internal`. New memories inherit the highest level of their sources.

**Confidentiality zones** (optional, unordered): e.g. `client-acme`, `project-x`. A memory can belong to a zone, restricting it to users with access to that zone. Orthogonal to the clearance ladder.

### 7.3 Default Roles

Editable in the admin dashboard. Stored as data, not hardcoded.

| Role | Memory clearance | Can do |
|---|---|---|
| **Owner/Admin** | Leadership | Everything: users, roles, all integrations, delete memory, cost monitor, approve self-improvement suggestions |
| **Operator** | Management | Review queue, memory inspector, manage assigned integrations, ingestion dashboard, proactive builder |
| **Manager** | Management | Use the brain + manager-gated features, view agent activity |
| **Member** | Internal | Use the brain (query + "remember this"), view own connections |

### 7.4 Permission Enforcement

- Enforced at the vector/retrieval layer, fail-closed. Filter by user's clearance + zones *during* retrieval.
- Never retrieve-then-filter (leaks via rankings).
- If permission service is unavailable → return nothing. Never return everything.
- Every write action checks permissions before execution.

### 7.5 Super Admin / Mission Control

The Owner/Admin role manages the system via the Mission Control dashboard:
- Create/edit/delete role groups
- Set individual permission nodes per role
- Assign users to roles
- Override individual user permissions (rare exception)
- Configure system-level cron jobs
- View and manage all connectors
- Set memory clearance per role

### 7.6 Database-level enforcement (RLS)

All 19 tables have Row Level Security enabled. This is the DB-layer safety net; the retrieval layer (§7.4) remains the primary enforcement point for memory access.

**Helper functions (SECURITY DEFINER, callable by `authenticated`):**
- `user_role_name()` → `text` — current user's role ('Owner', 'Operator', 'Manager', 'Member')
- `user_clearance_level()` → `int` — numeric clearance (Owner=4, Operator/Manager=3, Member=2)
- `sensitivity_to_level(text)` → `int` — maps 'public'=1, 'internal'=2, 'management'=3, 'leadership'=4

**Access summary:**
- Lookup tables (`roles`, `tools`, `connector_schemas`, `agent_configs`, `agent_config_versions`, `system_config`): SELECT for all authenticated; writes via service_role only (except `system_config` UPDATE for Owner).
- `users`: SELECT own row or Operator+; UPDATE own row or Owner.
- `memories`: SELECT where `sensitivity_to_level(sensitivity_level) ≤ user_clearance_level()`; writes service_role only.
- `memory_proposals`: SELECT own or Operator+; INSERT own; UPDATE Operator+.
- `connections`: SELECT own (per-user) or all (org) or Operator+; INSERT per-user own / org Operator+; UPDATE/DELETE own or Operator+.
- `routines`: SELECT own or Manager+; INSERT own user-scope; UPDATE own or Manager+; DELETE own or Operator+.
- `job_runs`, `agent_runs`: SELECT own or Manager+; writes service_role only.
- `miss_log`, `audit_log`, `cost_events`: SELECT Operator+; writes service_role only.
- `memory_feedback`: SELECT own or Operator+; INSERT own.
- `improvement_suggestions`: SELECT Operator+; UPDATE Owner (approve/reject); writes service_role only.
- `chunks`: SELECT own or org (NULL owner) or Manager+; writes service_role only.

Service role (worker) bypasses RLS entirely — all worker operations are unaffected.

---

## 8. Agent Execution Layer

### 8.1 The executeAgent Function

The single execution path everything runs through:

```typescript
async function executeAgent(params: {
  user: User                      // the acting user
  systemPrompt: string            // loaded from DB
  tools: Tool[]                   // permission-checked tools
  memoryContext?: Memory[]        // pre-retrieved, permission-filtered
  triggerContext: TriggerContext  // what triggered this
  permissions: Permission[]       // resolved permissions
}): Promise<AgentResult> {
  // 1. Log start to audit log
  // 2. Retrieve memory (if not pre-retrieved)
  // 3. Call LLM with system prompt + memory context + tools
  // 4. Execute tool calls (permission-checked)
  // 5. Collect feedback signals
  // 6. Log everything to audit log + agent activity
  // 7. Track cost
  // 8. Return result with provenance labels
}
```

### 8.1.1 Failure Handling

**Never partially write.** If `executeAgent()` fails mid-run after tool calls have already executed, log what completed to `agent_runs` but do not write partial memory proposals. The audit log records which tool calls succeeded before the failure.

| Trigger | Behaviour on LLM API failure |
|---|---|
| **User query** | Return a graceful error to the UI: *"I'm having trouble reaching my reasoning engine right now. Please try again in a moment."* Log to `agent_runs` with `status: 'failed'`. Do not auto-retry — the user retries manually. |
| **Cron job** | pg-boss retries automatically. Max 3 retries, exponential backoff. After all retries exhausted: mark job `failed`, surface in System Health dashboard (§12.9). Do not alert on first failure — alert only after all retries exhausted. |
| **Webhook-triggered job** | Same as cron — pg-boss retries. The webhook handler already returned `200`, so the external service is unaffected regardless of downstream failure. |

LLM API error rate is tracked in System Health (§12.9). A spike in failures triggers an active alert.

### 8.2 Tools

Tools are defined as data in the database, not hardcoded. Each tool has:

```typescript
tool {
  id: uuid
  name: string
  description: string            // shown to the LLM
  connector_type: string         // which connector it belongs to
  action_type: 'read' | 'write'
  required_permission: string    // RBAC permission node
  input_schema: jsonb
  output_schema: jsonb
  is_active: boolean
}
```

**Read tools (Phase 1):**
- `search_memory` — vector search over memory store
- `fetch_gmail` — read emails from connected Gmail
- `fetch_drive_file` — read file from Google Drive
- `search_drive` — search Google Drive files

**Write tools (Phase 1):**
- `propose_memory` — propose a new memory (goes through write pipeline, see §8.3)
- `create_gmail_draft` — create email draft
- `send_email` — send email (requires explicit permission)
- `create_drive_file` — create file in Google Drive
- `update_drive_file` — update file in Google Drive

### 8.3 Agent Memory Write Path

Agents never write directly to memory. All agent memory writes go through a proposal pipeline.

```typescript
propose_memory({
  claim: string,                 // the durable statement
  suggested_type: MemoryType,
  sources: SourceRef[],          // what this was derived from
  confidence: number,            // 0.0–1.0
  entity_refs: string[],         // which client/project/person
  acting_user: uuid,
  agent_id: uuid,
  task_id: uuid
})
```

Proposals land in a `memory_proposals` queue. Every 5 minutes, a pg-boss drain job processes them through a lightweight pipeline (not a full `executeAgent()` call — no LLM required for most proposals):

```
1. SENSITIVITY CHECK
   Resolve sensitivity_level from all source_refs.
   If any source is above the acting user's clearance → ROUTE TO REVIEW QUEUE.

2. CONFIDENCE THRESHOLD
   If proposal.confidence < system_config('memory_proposal_min_confidence') → ROUTE TO REVIEW QUEUE.
   Default threshold: 0.7 (configurable in Mission Control).

3. GATE 4 — STRUCTURED ACTION CHECK
   Does this proposal also produce an action item, new contact, or pipeline change?
   YES → dual-write: structured part to SoR + episodic memory of origin.
   NO  → commit directly to memory store.

4. COMMIT
   Write memory record. Set sensitivity_level, zone, provenance from proposal fields.
   Run content_hash dedup — skip if duplicate.
   If supersedes an older fact, invalidate old record (§4.3).
```

Proposals routed to the review queue appear in the Ingestion + Queue Health dashboard (§12.3) for Operator+ review.

**Sensitivity level on manual captures (role-gated):**
- **Member:** sensitivity level field is hidden in the "Remember this" modal. All Member-submitted proposals default to `internal`. Regardless of confidence score, every Member-submitted manual proposal is routed to the Operator review queue — a human always reviews before commit.
- **Operator and above:** sensitivity level is selectable in the capture UI. Proposals follow the standard confidence-threshold pipeline (§8.3) without mandatory human review.

This prevents Members from accidentally over-sharing sensitive content by under-labelling it.

A delivery agent never blocks waiting for proposal acceptance. Fire and forget into the queue.

### 8.4 Agent Configurations

Stored as data in the database. Never hardcoded.

```typescript
agent_config {
  id: uuid
  name: string
  description: string
  system_prompt: text            // editable, version-tracked
  model: string                  // e.g. 'claude-sonnet-4-6'
  tool_ids: uuid[]               // which tools this agent can use
  required_role: string | null   // null = system-only, not user-invokable
  is_active: boolean
  created_at: timestamptz
  updated_at: timestamptz
  version: integer               // incremented on every change
}
```

**Seeded system agent configs (inserted in initial migration, never hardcoded):**

| Name | Model | Role | Purpose |
|---|---|---|---|
| `system.ingestion.gate3_classifier` | `claude-haiku-4-5-20251001` | null | Gate 3 document-level classification. Returns `{ decision: 'memory' \| 'index' \| 'drop', confidence: 0.0–1.0, suggested_type: MemoryType, rationale: string }`. Haiku is used — this is a classification task, not a reasoning task. |
| `system.ingestion.gate3_chunk_classifier` | `claude-haiku-4-5-20251001` | null | Gate 3 per-chunk classification on documents that passed document-level Gate 3. Same output schema. |
| `system.memory.consolidation` | `claude-sonnet-4-6` | null | Nightly episodic → semantic consolidation (§4.4). |
| `system.memory.improvement_analysis` | `claude-sonnet-4-6` | null | Weekly self-improvement signal analysis (§11.3). |

All system agent prompts are tunable by the self-improvement loop (§11) and require admin approval before changes are applied. Before any update to `agent_configs`, the current row is copied to `agent_config_versions` (§13). Rollback restores a prior version row and increments `version`. The self-improvement dashboard (§12.6) links each suggestion to the version it produced.

---

## 9. Proactive Builder

A UI for creating automated routines: trigger → agent → output.

### 9.1 Routine Schema

```typescript
routine {
  id: uuid
  name: string
  description: string
  is_active: boolean
  
  // Trigger
  trigger_type: 'cron' | 'webhook'
  cron_schedule: string | null       // e.g. '0 8 * * *'
  webhook_connector: string | null   // e.g. 'gmail'
  webhook_event: string | null       // e.g. 'email.received'
  webhook_filters: jsonb | null      // e.g. { from: 'client@acme.com' }
  
  // Agent
  agent_config_id: uuid
  additional_context: text | null    // extra instructions for this routine
  
  // Output
  output_type: 'email' | 'slack' | 'memory' | 'dashboard_notification' | 'tool_write'
  output_config: jsonb               // destination details
  
  // Ownership
  created_by: uuid
  scope: 'system' | 'user'          // system = admin only, user = creator only
  
  created_at: timestamptz
  updated_at: timestamptz
}
```

### 9.2 Routine Builder UI

Three-step builder:

**Step 1 — Trigger**
- Type: Cron or Webhook
- If Cron: schedule picker (every day, every week, custom cron expression)
- If Webhook: connector picker → event picker → optional filters

**Step 2 — Agent**
- Pick from existing agent configs or create inline
- Optionally add context specific to this routine

**Step 3 — Output**
- Where does the result go?
- Email: recipient(s), subject template
- Slack: channel or DM
- Memory: auto-saved to memory store
- Dashboard notification: notify specified roles
- Tool write: write back to a connected tool

### 9.3 System vs User Routines

- **System routines** — created in Mission Control by admin only. Run under a system service account. Examples: nightly memory consolidation, weekly digest, memory decay job.
- **User routines** — created by users with the relevant RBAC permission. Run under the creating user's identity. Examples: personal meeting prep, custom reports.

Users cannot schedule access beyond what they already have interactively.

When a user is deactivated, all their routines are disabled immediately — same moment as session revocation. Disabled routines appear in the Proactive Builder dashboard for admin review. An admin can manually re-create or reassign them. Routines are never silently transferred to another user or the system account.

---

## 10. Cron Jobs

### 10.1 System Cron Jobs (configured in Mission Control)

| Job | Default schedule | What it does |
|---|---|---|
| Memory consolidation | Nightly 2am | Distils episodic → semantic facts |
| Memory decay | Weekly Sunday 3am | Invalidates stale/low-utility memories |
| Self-improvement analysis | Weekly Monday 6am | Analyses performance signals, generates suggestions |
| Connector sync | Every 15 minutes | Pulls new content from all active connectors |
| Token refresh | Every 30 minutes | Renews OAuth tokens before expiry |
| Drive webhook renewal | Daily 1am | Renews Google Drive webhooks expiring within 48 hours. Failures surfaced in System Health dashboard immediately. |
| Memory proposal drain | Every 5 minutes | Processes pending memory proposals from agents |

### 10.2 User Cron Jobs

Users with permission create via the Proactive Builder. Stored as routines with `trigger_type = 'cron'`.

### 10.3 Job Schema (pg-boss)

Every job execution is logged:

```typescript
job_run {
  id: uuid
  routine_id: uuid | null       // null for system jobs
  job_type: string
  triggered_by: 'cron' | 'webhook' | 'manual' | 'system'
  acting_user_id: uuid          // system jobs use the seeded system user (§13)
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at: timestamptz
  completed_at: timestamptz
  output: jsonb
  error: text | null
  tokens_used: integer
  cost_usd: decimal
}
```

---

## 11. Self-Improvement Loop

### 11.1 Feedback Signals

Captured everywhere, from day one:

**Memory feedback** (on every memory record):
- Thumbs up/down from users
- "Stop storing things like this" signal
- "This is wrong/stale" signal → triggers invalidation
- Implicit: retrieval count, last retrieved, whether it was used in an answer

**Agent output feedback** (on every agent response):
- Thumbs up/down
- Explicit correction ("the right answer was X")
- Whether the answer was an abstention (miss log)

### 11.2 Miss Log

Every time the brain abstains or can't answer, log:

```typescript
miss_log {
  id: uuid
  query: text
  reason: 'no_memory' | 'below_relevance_floor' | 'source_unavailable'
  user_id: uuid
  created_at: timestamptz
  resolved: boolean              // marked true when the gap is filled
}
```

### 11.3 Weekly Self-Improvement Cron

Runs every Monday 6am. Analyses all signals from the past week and generates specific, actionable suggestions.

```typescript
improvement_suggestion {
  id: uuid
  category: 'memory_quality' | 'agent_prompt' | 'retrieval_settings' | 'capture_rules' | 'decay_settings'
  title: string
  reasoning: text                // why this suggestion was generated, with evidence
  proposed_change: jsonb         // the exact config change being suggested
  target_config_id: uuid | null  // which agent/setting this affects
  evidence: jsonb                // the signals that drove this (low ratings, miss count etc.)
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: uuid | null
  reviewed_at: timestamptz | null
  created_at: timestamptz
}
```

Examples of generated suggestions:
- *"Meeting brief agent had 4 low ratings this week. Suggested prompt change: [specific change with reasoning]"*
- *"12 memories about client onboarding have never been retrieved. Suggested: decay them."*
- *"Brain missed 6 questions about pricing this week. Suggested: adjust capture rules to promote pricing discussions to semantic memory."*

### 11.4 Human Approval

Suggestions sit in the self-improvement dashboard. Admin reviews and approves or rejects. Approved changes are applied immediately to the relevant config record in the database. No deploy required.

### 11.5 Config as Data — The Critical Requirement

Everything the self-improvement system needs to modify must be stored in the database, not hardcoded:
- Agent system prompts (`agent_config.system_prompt`)
- Memory capture thresholds
- Retrieval relevance floor
- Decay cadence and aggressiveness
- Connector ingestion rules

If any of these are hardcoded, the self-improvement layer cannot modify them. **This is a hard requirement.**

---

## 12. Observability Dashboards

12 dashboards. Role access as specified. All data comes from the existing tables — nothing requires additional data collection if everything above is instrumented correctly.

### 12.1 Query Interface
**Who:** Everyone
**What:** Natural language query box. Answers displayed with provenance labels (§5.1). Source citations. Feedback buttons (thumbs up/down, "this is wrong"). Abstention displayed clearly. History of past queries.

### 12.2 Memory Inspector
**Who:** Everyone (filtered to their clearance)
**What:** Browse everything the brain knows. Filter by: entity (client, project, person), memory type, date range, source, sensitivity level. Each record shows: content, source, created date, last retrieved, sensitivity level. Admin can edit, invalidate, or broaden a memory's visibility.

### 12.3 Ingestion + Queue Health
**Who:** Operator+
**What:**
- What came in by connector and time period
- What was captured (by memory type)
- What was dropped (by exclusion reason)
- What was indexed-in-place (RAG only, not promoted)
- Human review queue: depth, oldest item age, backlog trend
- Memory proposal queue: depth and drain rate
- Confidence score distributions

### 12.4 Agent Activity + Full Traces
**Who:** Manager+
**What:** Every agent run listed. For each run:
- Which agent, which user, which trigger
- Full step-by-step trace: memory retrieved, tools called, tool responses, reasoning, output
- Performance rating (from user feedback)
- Tokens used, cost
- Duration
Filter by agent, user, date, rating, status.

### 12.5 Proactive Builder
**Who:** Operator+
**What:** Create, edit, enable/disable routines (§9). View run history per routine. See last run output. Test run button.

### 12.6 Self-Improvement Suggestions
**Who:** Admin
**What:** Pending suggestions with evidence and reasoning. Approve/reject buttons. History of approved/rejected suggestions with outcomes. Performance trend charts (answer quality, miss rate, retrieval quality over time).

### 12.7 Cost Monitor
**Who:** Admin
**What:**
- Token spend by day/week/month
- Breakdown by: user, agent, connector, job type
- Storage growth (memory records, vector index, file storage)
- Tool call volume
- Per-user cost
- Budget alert threshold (configurable). Alert fires when approaching limit.

### 12.8 Quality Monitor (Silent Failure Detection)
**Who:** Admin
**What:**
- Abstention rate over time (brain saying "I don't know" — rising = good; suddenly dropping = suspicious)
- Memory miss rate (queries the brain couldn't answer)
- Low-rated answer rate trend
- Memory utility distribution (are memories being retrieved or just accumulating?)
- Retrieval quality scores over time
- Any metric that would indicate silent degradation
- Alerts when any metric breaches a threshold

### 12.9 System Health
**Who:** Admin
**What:**
- Failed jobs (with error detail and retry state)
- Connector status (connected, expired, error, last sync time)
- LLM API error rate
- Queue depths (ingestion, proposals, review)
- Worker service health
- Database connection health
- Active alerts

### 12.10 Audit Log
**Who:** Admin
**What:** Append-only, tamper-evident log of every action:
- Auth events (login, logout, failed login)
- Connection lifecycle (connect, revoke, reconnect, refresh failure)
- Permission changes (highest-value class — who changed what role)
- Memory mutations (write, invalidate, delete, broaden — human or agent)
- Tool write actions (what the agent did in external tools)
- Query access (who asked what, when)
- Review queue decisions
- Config changes (system prompts, settings)

Filterable by: user, action type, date range.

**The rule — log references and actions, never content.** The audit log must be useful for reconstruction without becoming a second copy of sensitive data that bypasses the permission model.

| Event | Logged | Not logged |
|---|---|---|
| Memory write | `memory_id`, `sensitivity_level`, `author_id`, `action` | Memory content |
| Memory invalidation | `memory_id`, `reason`, `invalidated_by` | Memory content |
| Query | `agent_run_id`, `user_id`, `timestamp` | Query text or answer (lives in `agent_runs`, permission-gated) |
| Permission change | `user_id`, `old_role_id`, `new_role_id`, `changed_by` | — |
| Tool write | `tool_name`, `connection_id`, `target_ref` (e.g. email thread ID) | Email body or file content |
| Auth event | `user_id`, `event_type`, `ip_address`, `timestamp` | Passwords or tokens |
| Config change | `config_key`, `changed_by`, `old_version`, `new_version` | Old/new prompt text (lives in `agent_configs` with version history) |

Query text and agent reasoning are stored in `agent_runs` (§12.4), which is permission-gated to Manager+. The audit log holds only the `agent_run_id` pointer.

### 12.11 Mission Control
**Who:** Admin
**What:**
- User management (list, invite, deactivate, assign role)
- Role management (create/edit roles, set permission nodes, set memory clearance per role)
- System cron job management (enable/disable, adjust schedule, view run history)
- Global settings (memory retention policies, relevance floor, decay settings)

### 12.12 Navigation and Default Views by Role

The navigation renders only what the user's role permits — absent entirely, not hidden or greyed out. No role sees a dashboard they cannot access.

**Member** — single-page experience:
- **Query box** (primary). Ask anything, get an answer with provenance labels, feedback buttons.
- **"Remember this" button** — modal to capture a memory manually. Pre-fills `suggested_type`, optional entity tag. Sensitivity level field is hidden — all Member captures default to `internal` and are routed to Operator review before committing (§8.3). Fires `propose_memory()`, shows confirmation. No blocking wait.
- **My Connections** — personal connector status (Gmail, Drive). Reconnect prompts if tokens expired.

**Manager** — Member experience plus:
- Memory Inspector (filtered to their clearance)
- Agent Activity (view runs, traces, ratings)

**Operator** — Manager experience plus:
- Ingestion + Queue Health
- Proactive Builder
- Connector Management

**Admin/Owner** — full navigation:
- All dashboards
- Mission Control
- Self-Improvement Suggestions
- Cost Monitor
- Quality Monitor
- System Health
- Audit Log

Default landing page for all roles: Query Interface.

### 12.13 Connector Management
**Who:** Admin
**What:**
- All company-wide connectors: status, scope, last sync, errors
- Per-user connection status: who is connected, who needs to reconnect
- Add/remove connectors
- Configure connector-level exclusion rules (do-not-ingest sources)
- View per-connector ingestion stats

---

## 13. Key Database Tables

The full schema. Build all of these in the initial migration.

```sql
-- Users (managed by Supabase Auth, extended here)
users (id, email, full_name, role_id, created_at, last_seen_at, is_active)
-- Seeded system user (inserted in initial migration):
--   id:    00000000-0000-0000-0000-000000000001
--   email: system@internal
--   role:  Owner (Leadership clearance)
--   is_active: false  -- never appears in UI, cannot log in
-- All system cron jobs run as this user. Never exposed in user management UI.

-- Roles
roles (id, name, clearance_level, permissions jsonb, created_at)

-- Memory
memories (
  id, type, content, embedding vector(1024),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  -- GIN index on search_vector for fast keyword search: CREATE INDEX ON memories USING GIN (search_vector)
  source_refs jsonb, author_type, author_id, agent_task_id,
  status, valid_from, valid_to,
  sensitivity_level, zone, namespace,
  retrieval_count, last_retrieved_at, utility_score,
  content_hash, embedding_model, embedding_model_version,
  created_at, updated_at
)

-- Memory proposals (agent write queue)
memory_proposals (
  id, claim, suggested_type, sources jsonb, confidence,
  entity_refs jsonb, acting_user_id, agent_id, task_id,
  status, reviewed_by, reviewed_at, created_at
)

-- Connectors
connections (
  id, connector_type, scope, owner_user_id,
  credential_ref, status, granted_scopes jsonb,
  last_synced_at, webhook_expires_at timestamptz | null,
  created_by, created_at
)
-- webhook_expires_at: set for connectors with expiring webhooks (e.g. Google Drive, max 7 days).
-- null for connectors with persistent push subscriptions (e.g. Gmail via Pub/Sub) or polling-only connectors.

-- Agent configs (all configurable, stored as data)
agent_configs (
  id, name, description, system_prompt,
  model, tool_ids jsonb, required_role,
  is_active, version, created_at, updated_at
)

-- Agent config version history (append-only, written before every update to agent_configs)
agent_config_versions (
  id, agent_config_id,
  version,              -- the version number being replaced
  system_prompt,        -- the full prompt at that version
  model,
  tool_ids jsonb,
  changed_by uuid,      -- user_id or system user id
  change_reason text,   -- 'self_improvement_approval' | 'manual_edit' | 'rollback'
  improvement_suggestion_id uuid | null,  -- link to the suggestion that triggered this change
  created_at
)

-- Tools
tools (
  id, name, description, connector_type, action_type,
  required_permission, input_schema jsonb, output_schema jsonb,
  is_active
)

-- Routines (proactive builder)
routines (
  id, name, description, is_active,
  trigger_type, cron_schedule, webhook_connector, webhook_event, webhook_filters jsonb,
  agent_config_id, additional_context,
  output_type, output_config jsonb,
  created_by, scope, created_at, updated_at
)

-- Job runs
job_runs (
  id, routine_id, job_type, triggered_by,
  acting_user_id, status,
  started_at, completed_at,
  output jsonb, error,
  tokens_used, cost_usd
)

-- Agent runs (detailed, with full trace)
agent_runs (
  id, agent_config_id, acting_user_id, job_run_id,
  trigger_context jsonb,
  memory_retrieved jsonb,  -- what was retrieved
  tool_calls jsonb,        -- every tool call + response
  reasoning_trace text,    -- step by step
  output text,
  provenance_labels jsonb, -- the labels attached to the output
  tokens_used, cost_usd,
  duration_ms,
  user_rating smallint | null,  -- -1, 0, 1
  user_feedback text | null,
  created_at
)

-- Miss log
miss_log (
  id, query, reason, user_id, agent_run_id,
  resolved, created_at
)

-- Feedback on memories
memory_feedback (
  id, memory_id, user_id,
  rating smallint,  -- -1, 0, 1
  feedback_type: 'wrong' | 'stale' | 'stop_storing' | 'helpful',
  note text,
  created_at
)

-- Self-improvement suggestions
improvement_suggestions (
  id, category, title, reasoning,
  proposed_change jsonb, target_config_id,
  evidence jsonb, status,
  reviewed_by, reviewed_at, created_at
)

-- Audit log (append-only)
audit_log (
  id, action_type, actor_id, actor_type,
  target_type, target_id,
  metadata jsonb,  -- hashes/refs, never raw content
  ip_address,
  created_at
)

-- Cost tracking
cost_events (
  id, user_id, agent_run_id, job_run_id,
  event_type, tokens_input, tokens_output,
  cost_usd, model, created_at
)

-- Chunks (index-in-place content — searchable but not promoted to memory records)
chunks (
  id,
  source_ref jsonb,          -- document ID, email ID, or file ID this chunk came from
  content text,
  embedding vector(1024),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  -- GIN index on search_vector: CREATE INDEX ON chunks USING GIN (search_vector)
  embedding_model text,
  connector_type text,
  owner_user_id uuid | null, -- non-null for per-user connectors; restricts visibility to that user
  created_at timestamptz
)
-- No status, utility_score, sensitivity_level, or invalidation fields.
-- Pruned by age-based TTL cron (chunk_ttl_days system_config key, default: 90 days).

-- Connector schemas (SoR field discovery)
connector_schemas (
  id, connector_type, schema jsonb,
  last_discovered_at
)

-- System config (global settings as data)
-- Seeded with defaults on initial migration. All values editable in Mission Control.
system_config (
  id, key, value jsonb,
  updated_by, updated_at
)
-- Required seed rows:
-- retrieval_min_relevance                → 0.72
-- retrieval_max_results                  → 20
-- memory_proposal_min_confidence         → 0.7
-- decay_min_utility_score                → 0.2
-- decay_min_age_days                     → 30
-- decay_cron_schedule                    → "0 3 * * 0"
-- consolidation_last_run_at              → null (set after first run)
-- consolidation_dedup_similarity_threshold → 0.92
-- consolidation_cron_schedule            → "0 2 * * *"
-- chunk_ttl_days                         → 90
```

---

## 14. Auth and Identity

### 14.1 Authentication

- **Primary:** Google OAuth via Supabase Auth
- **Fallback:** email/password for deployments without Google Workspace

On first login → auto-provision user record → assign default Member role → prompt to connect personal tools (Gmail, Drive).

### 14.2 Identity Linking

Every user gets a deterministic Tier-1 identity link via their verified Google account email. This is the foundation for attributing memories and actions to the right person.

### 14.3 Onboarding Flow

1. Google OAuth login
2. Account auto-provisioned
3. Role assigned (default: Member, or from Google Workspace group mapping)
4. Prompted to connect personal tools
5. Consent logged (timestamp + version): what the brain extracts, what's excluded, who can see what

### 14.4 Offboarding

When a user is deactivated:
- Sessions revoked immediately
- OAuth connections revoked
- Role stripped
- **Their contributed memories are retained** — institutional knowledge stays when people leave
- The brain stops ingesting new content from their connections
- All user routines created by this user are disabled immediately (see §9.3)
- `author_id` on their memories is never reassigned — provenance is permanent. The UI displays "former employee" for deactivated authors.

**Right-to-be-forgotten (RTBF):**
- RTBF is a manual admin action in Mission Control, not an automated flow — human judgement is required to distinguish personal memories from institutional ones.
- The Mission Control user management UI exposes a "Request RTBF" action per deactivated user. This flags all memories where `author_id = that user` for admin review.
- Admin reviews flagged memories and selects which to invalidate. Invalidation follows the standard invalidate-don't-overwrite pattern (§4.3) with `reason: 'rtbf'` recorded in the audit log.
- Auto-deletion without review is not supported.

---

## 15. Build Sequence

Build in this exact order. Each step depends on the one before it.

### Step 1 — Project scaffold
- Initialise Next.js 14 (TypeScript, App Router) monorepo
- Set up Railway: `app` service + `worker` service
- Connect Supabase project
- Run full database migration (all tables from §13)
- Set up environment variables

### Step 2 — Auth
- Google OAuth via Supabase Auth
- Email/password fallback
- User auto-provisioning on first login
- Session management
- Protected routes by role

### Step 3 — Core execution layer
- Implement `executeAgent()` function
- Basic memory retrieval (vector search + permission filter)
- Audit log wiring (every execution logged)
- Cost tracking wiring

### Step 4 — Memory store
- Memory CRUD
- Invalidate-don't-overwrite
- Content hash dedup (tier-1)
- Embedding generation (Voyage AI)
- Permission-filtered retrieval (clearance ladder + zones)

### Step 5 — First connector: Gmail
- Google OAuth token flow
- Per-user connection stored in Supabase Vault via credential_ref
- Gmail history sync + push notifications
- Routing decision tree applied to incoming emails
- Index-in-place (RAG) for non-promoted content
- Memory write pipeline for promoted content
- Auto token refresh job

### Step 6 — Second connector: Google Drive
- Same pattern as Gmail
- File ingestion, chunking, embedding
- Drive webhook for new/updated files

### Step 7 — Query interface (Dashboard 1)
- Natural language query UI
- `executeAgent()` called on every query
- Provenance + freshness labels on every response
- Abstention handling
- Feedback buttons
- Miss log wiring

### Step 8 — RBAC + Mission Control (Dashboard 11)
- Role management UI
- User management UI
- Permission node configuration
- Memory clearance assignment per role

### Step 9 — pg-boss job queue
- Worker service initialised with pg-boss
- System cron jobs registered (consolidation, decay, token refresh, connector sync)
- Job run logging to `job_runs` table

### Step 10 — Memory inspector (Dashboard 2)
- Browse memories by entity, type, date, source
- Invalidate / edit / broaden from UI
- Provenance display

### Step 11 — Proactive builder (Dashboard 5)
- Routine builder UI (trigger → agent → output)
- Cron trigger support
- Webhook trigger support
- Routine enable/disable
- Run history

### Step 12 — Agent activity + traces (Dashboard 4)
- Full trace display per agent run
- Filter and search
- Performance ratings

### Step 13 — Self-improvement loop
- Feedback signal capture on all memory records and agent outputs
- Miss log capture
- Weekly analysis cron job
- Suggestions generated and stored
- Self-improvement dashboard (Dashboard 6)

### Step 14 — Remaining dashboards
- Ingestion + queue health (Dashboard 3)
- Cost monitor (Dashboard 7)
- Quality monitor (Dashboard 8)
- System health (Dashboard 9)
- Audit log (Dashboard 10)
- Connector management (Dashboard 12)

### Step 15 — Memory consolidation + decay cron jobs
- Episodic → semantic consolidation job with watermark guard and near-duplicate similarity check (§4.4)
- Decay job with utility score formula and configurable thresholds (§4.5)

---

### Post-Phase-1 Operational Task — Client Provisioning Script

Not part of Phase 1 DoD. An agency-internal CLI tool, never client-facing.

`packages/scripts/provision-client.ts` — run once per new client:

1. Create a new Supabase project via the Supabase Management API
2. Run the full database migration against it
3. Seed `system_config` defaults, system user, default roles, seeded agent configs, and seed tool rows
4. Create a new Railway project, deploy the `app` and `worker` Docker images, set client-specific environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, etc.)
5. Output a human checklist: connect Gmail, connect Drive, invite first admin user

**Dependency:** the migration and seed files this script runs must be complete and idempotent by end of Phase 1 (see §16).

---

## 16. Definition of Done — Phase 1

- [ ] Google OAuth login works. Users auto-provisioned with correct role.
- [ ] Gmail and Google Drive connected per-user. Tokens in Supabase Vault. Auto-refresh working.
- [ ] Routing decision tree applied to all incoming content. SoR fields never stored in memory.
- [ ] Memory store working: typed records, provenance, clearance-ladder, invalidate-don't-overwrite, tier-1 dedup, embeddings versioned.
- [ ] Permission-filtered retrieval enforced at vector layer, fail-closed. Restricted content invisible to users without clearance.
- [ ] Query interface returns answers with provenance + freshness labels. Brain abstains below relevance floor. Misses logged.
- [ ] Every agent run goes through `executeAgent()`. Full trace logged. Cost tracked.
- [ ] All agent configs, system prompts, tools, settings stored in database — nothing hardcoded.
- [ ] Write tools work: propose_memory pipeline, Gmail draft/send, Drive create/update.
- [ ] Proactive builder working: create cron and webhook routines, configure agent + output, enable/disable.
- [ ] System cron jobs running: connector sync, token refresh, memory proposal drain.
- [ ] Feedback signals captured on all memory records and agent outputs.
- [ ] Miss log populated on every abstention.
- [ ] Weekly self-improvement cron generates suggestions. Admin can approve/reject. Approved changes applied to DB config.
- [ ] Memory consolidation cron running: episodic → semantic.
- [ ] Memory decay cron running: stale/low-utility memories invalidated.
- [ ] All 12 dashboards live and populated with real data.
- [ ] Audit log append-only, stores hashes not content, filterable by user and action type.
- [ ] Connector management: add/remove connectors, view status, set exclusion rules.
- [ ] Mission Control: create/edit roles, assign users, configure permission nodes, manage system crons.
- [ ] Cost monitor: per-user cost visible, budget alert threshold configurable and firing.
- [ ] Quality monitor: abstention rate, miss rate, low-rating trend all visible and alerting on threshold breach.
- [ ] System health: failed jobs, connector errors, queue depths all visible.
- [ ] Offboarding: deactivating a user revokes access immediately, disables their routines, and retains their memories.
- [ ] All database migrations are idempotent — safe to re-run without side effects.
- [ ] All seed files (system_config defaults, system user, default roles, seeded agent configs, tool rows) are idempotent — safe to re-run against an already-seeded database.

---

## 17. What Comes After Phase 1

Do not build these now. They are documented here so the Phase 1 build does not accidentally block them.

**Phase 2 — Proactive intelligence**
- Smarter self-improvement: the weekly cron generates suggestions with deeper reasoning, not just raw metrics surfacing
- More connectors: Slack, Microsoft Teams/Outlook, GoHighLevel CRM, Asana
- Handover document generation on offboarding
- Richer proactive routine templates

**Phase 3 — Autonomous agents**
- Event-driven triggers that the agent reacts to without human configuration (monitoring + reaction)
- Multi-step self-directed planning (agent decides its own next steps)
- Sub-agent spawning and orchestration
- Agents that proactively surface insights without being asked

**Later**
- Workflow builder UI for complex multi-step routines
- Knowledge graph (project relational edges from Postgres into Neo4j when multi-hop queries are needed)
- Fuzzy entity resolution across connectors
- Tiered semantic deduplication (similarity-based, with human review band)
- Automated prompt/config modification without human approval (only if client specifically requests it)

---

*Built for 10–70 person businesses. Single-tenant. One deployment per client. The brain that follows everyone everywhere.*
