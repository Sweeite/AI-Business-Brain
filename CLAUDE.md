# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Orient yourself first

Before doing any work, read `CONTEXT.md`. It contains:
- Full stack and monorepo layout
- DB schema summary and seeded data
- Build sequence (issues #1–21) with ✅/⬜ status
- QA state section (which QA round ran and where the results live)

## Key files to know

| File | Purpose |
|------|---------|
| `CONTEXT.md` | Single source of truth for architecture, build state, and QA state |
| `ai-business-brain-prd.md` | Product requirements — final say on behaviour |
| `qa/TEST_CASES.md` | 136 test cases across issues #11–13, plus known gaps G1–G4 |
| `qa/CHECKPOINTS.md` | QA round 1 (CP1–12) and round 2 (CP13–22) — all complete |
| `qa/FIX_BACKLOG.md` | All bugs/UX issues extracted from QA (QA1 + QA2), deferred items |

## Fix backlog references

When the user says "fix QA1 tasks" or mentions a QA ID (e.g. QA1-B5, QA2-B1):
1. Read `qa/FIX_BACKLOG.md` — find the exact description under the relevant section
2. Read the relevant source files before touching anything
3. Fix only what the ID describes — no scope creep

---

## Commands

```bash
# Dev servers (run each in its own terminal)
pnpm --filter @brain/app dev          # Next.js on http://localhost:3000
pnpm --filter @brain/worker dev       # Worker with tsx watch + dotenv

# Typecheck (run after every change; all three must pass)
pnpm --filter @brain/app typecheck
pnpm --filter @brain/worker typecheck
pnpm --filter @brain/core typecheck

# Lint
pnpm -r lint                          # runs next lint in @brain/app

# Supabase
supabase migration list               # confirm all local migrations are applied on remote
supabase db push                      # push pending local migrations to remote
supabase db query --linked "<sql>"    # run ad-hoc SQL against the remote DB

# Regenerate DB types after a schema change
supabase gen types typescript --linked > packages/core/src/db/database.types.ts
```

No test runner is configured — QA is manual using `qa/TEST_CASES.md` and `qa/CHECKPOINTS.md`.

---

## Architecture

### Package layout

Three packages share a pnpm workspace. `@brain/core` is never compiled — both consumers resolve it via `tsconfig.json` `paths` aliases pointing at `../core/src/index.ts` directly.

```
packages/
  core/    — shared types, Supabase client factory, agent executor, memory r/w, ingestion pipeline
  app/     — Next.js 14 App Router: pages, API routes, webhook receivers
  worker/  — Node.js + pg-boss: job handlers, cron scheduling
supabase/
  migrations/  — one file per DB change, always idempotent
```

### Two Supabase client patterns

There are two clients and picking the wrong one causes subtle bugs.

| Client | Factory | Session | Use when |
|--------|---------|---------|----------|
| Session (anon) | `createClient()` from `@/lib/supabase/server` | User's JWT — RLS applies | API routes that should respect the caller's clearance; reading memories as a user |
| Service role | `createSupabaseClient(URL, SERVICE_KEY)` from `@brain/core` | Bypasses RLS | Writing to `agent_runs`, `cost_events`, `audit_log`; server component role lookups; all worker operations |

**Critical:** In App Router server components and middleware, `auth.uid()` does NOT propagate to PostgREST when using the anon client. Use the service role client for any `public.users` / role lookups outside of API routes. The anon client is only used for `supabase.auth.getUser()` (session validation).

### Route protection flow

`packages/app/src/middleware.ts` runs on every non-static request:
1. `createServerClient` (anon) → `getUser()` — unauthenticated users are redirected to `/login`
2. For role-gated pages: service role client fetches `public.users.role_id → roles.name`, then calls `hasRouteAccess(roleName, pathname)` from `@brain/core`
3. `hasRouteAccess` checks the role's nav item list — routes not in the list redirect to `/`

Role nav hierarchy (additive — each role includes the one below):
- **Member** → `/` (Query only)
- **Manager** → + `/memory`, `/activity`
- **Operator** → + `/proactive`, `/ingestion`, `/connectors`
- **Owner/Admin** → + all dashboards + `/mission-control`

### Admin API pattern

All `/api/admin/` routes start with:
```ts
const ctx = await requireOwner()
if (isErrorResponse(ctx)) return ctx
const { actorId, serviceClient } = ctx
```
`requireOwner()` (in `packages/app/src/lib/admin-auth.ts`) returns 401/403 `NextResponse` on failure, or `{ actorId, serviceClient }` on success. Both 'Owner' and 'Admin' role names pass — only 'Owner' is seeded.

### Worker job architecture

`packages/worker/src/index.ts` starts pg-boss (needs `DATABASE_URL`) and a service-role Supabase client. On startup:
1. `scheduleSystemCrons()` — reads cron schedules and active flags from `system_config`, calls `boss.schedule()` for each enabled job
2. `registerAllJobs()` — calls `boss.work()` for each job type

Job types (constants in `packages/worker/src/jobs/constants.ts`):
- `gmail.sync`, `drive.sync`, `connector.sync` — connector ingestion
- `token.refresh`, `drive.webhook.renew` — maintenance
- `memory.proposal.drain` — drains `memory_proposals` table into `memories`
- `routine.run` — executes a user or system routine via `executeAgent()`
- `routine.schedule.sync` — syncs cron-triggered routines from DB into pg-boss schedule

**Schedule changes** (via Mission Control Crons tab) require a worker restart to take effect — `scheduleSystemCrons` only runs at startup.

**App → worker job queuing:** The app has no `DATABASE_URL`. It enqueues jobs via `serviceClient.rpc('enqueue_job', { p_name, p_data })` — a SECURITY DEFINER Postgres function that inserts into `pgboss.job`.

### Ingestion routing pipeline

`runRoutingPipeline()` in `packages/core/src/ingestion/routing.ts` processes one document (email or Drive file):
- **Gate 1** — exclusion rules (email/domain blocklist); Drive always passes (empty `senderEmail`)
- **Gate 2** — skipped (unstructured connector stub)
- **Gate 3** — Haiku classifier: `memory` (durable decision/SOP) → `memory_proposals`; `index` → `chunks` table (unless `skipIndexInPlace: true`); `drop` → discarded
- **Gate 4** — stubbed (always NO)

Drive sync always passes `skipIndexInPlace: true` — Drive content is accessed live via tools, not indexed to chunks.

Each Gate 3 Haiku call writes a `cost_events` row (`event_type = 'ingestion_gate3'`).

### `executeAgent()` contract

Lives at `packages/core/src/agent/execute.ts`. Callers must supply:
- `agentConfigId` + `model` — load from the `agent_configs` row
- `serviceClient` — **must be service role** (writes to `agent_runs`, `cost_events`, `audit_log`)
- `user` — the acting user; pass system user (`SYSTEM_USER_ID`) for cron-triggered runs
- `retrievalContext` — optional; required for `search_memory` tool calls to work

The function runs an agentic loop (Anthropic SDK), logs every tool call, commits `memory_proposals` only on the success path (partial-write guard), and updates `agent_run.status` to `'completed'` or `'failed'`.

For `user_query` triggers: errors return gracefully with a user-facing message. For `cron`/`webhook` triggers: errors are rethrown so pg-boss can retry.

### Memory write pattern

`writeMemory()` in `packages/core/src/memory/write.ts`:
1. SHA-256 content hash dedup — skips if an active record with that hash exists
2. If `supersedingId` given — calls `invalidateMemory()` on the old row first
3. Generates Voyage embedding, inserts new row

`utility_score` is `null` on insert — it's computed later by the decay cron job. The column must allow NULL (if you see a NOT NULL constraint error, this is the root cause).

---

## Project rules

- **One Railway + one Supabase per client.** No multi-tenant assumptions.
- **RLS is the security layer.** Never post-filter in application code what RLS should block.
- **Invalidate-don't-overwrite.** Memory mutations set `valid_to = now()` + `status = 'invalidated'` on the old row, then insert a new row.
- **No DATABASE_URL in the app.** Use `serviceClient.rpc('enqueue_job', ...)` to enqueue pg-boss jobs from app routes.
- **`requireOwner()`** checks role name = 'Owner' OR 'Admin'. Only 'Owner' exists among seeded roles — there is no 'Admin' role.
- **`handle_new_user` trigger** fires on `auth.users` INSERT and creates a `public.users` row with Member role. Deleting an auth user does NOT cascade to `public.users` — orphaned rows will block re-invite on the same email.

## Build discipline

- Typecheck after every change: `pnpm --filter @brain/app tsc --noEmit`
- Run migrations via Supabase CLI, never raw psql against prod
- One commit per issue; update `CONTEXT.md` build sequence table in the same commit
- After any schema change: regenerate `packages/core/src/db/database.types.ts` and check it in
