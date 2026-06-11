# QA Checkpoints — Round 3 (Issues #14, #15, #16, #17)

> Covers: Agent Activity + Full Traces, Self-Improvement Loop, Memory Consolidation Cron, Memory Decay Cron.
>
> Work through checkpoints in order. Each is 5–20 minutes.
> Use `qa/TEST_CASES_QA3.md` for full numbered test case detail.
> Mark each item ✅ Done, ❌ Failed, or ⚠️ Partial. Add notes inline.

---

## Prerequisites

Before starting:

- `pnpm --filter @brain/app dev` — app running with no errors
- `pnpm --filter @brain/worker dev` — worker running, connected to pg-boss
- `supabase migration list` — all migrations applied, none pending
- Owner-role user available: `austinsmith1704@gmail.com`
- Manager-role user available (promote one in Mission Control if needed)
- Member-role user available
- At least a few agent runs exist in the DB (run a `/` query to generate if needed)
- At least 3–4 active memories exist with `type='episodic'` for consolidation testing

**How to manually trigger cron jobs (use these throughout QA3):**

```bash
supabase db query --linked "SELECT enqueue_job('memory.consolidation', '{}'::jsonb)"
supabase db query --linked "SELECT enqueue_job('memory.decay', '{}'::jsonb)"
supabase db query --linked "SELECT enqueue_job('improvement.analysis', '{}'::jsonb)"
```

Watch worker logs — jobs pick up within ~5 seconds.

---

## Checkpoint 1 — Environment (5 min)

- App starts without TypeScript errors - Done
- Worker starts and prints `[worker] ready` - Done
- Worker startup logs show `[worker] scheduled memory.consolidation @ 0 2 * * *` - Done
- Worker startup logs show `[worker] scheduled memory.decay @ 0 3 * * 0` - Done
- Worker startup logs show `[worker] scheduled improvement.analysis @ 0 6 * * 1` - Done
- `supabase migration list` — all applied, none pending - Done

**Result:** ⬜ Pass 

**Notes:**

---

## Checkpoint 2 — Activity Dashboard: Route Protection + Load (5 min)

Log in as each user type and verify access.

- Logged out → visit `/activity` → redirected to `/login`  - Done
- Member → visit `/activity` → redirected to `/` (403 or redirect) - Done
- Manager → visit `/activity` → page loads with "Agent Activity" heading - Done
- Owner → visit `/activity` → page loads (included for completeness). - Done
- `/activity` shows run count in subheading (e.g. "12 runs found") - Done
- At least one run card visible with agent name, trigger badge, status badge, user name, timestamp - Done
- Run card shows tokens, cost, duration, rating stats row - Done

**Result:** ⬜ Pass 

**Notes:**

---

## Checkpoint 3 — Activity Dashboard: Filters (10 min)

Log in as Owner. Stay on `/activity`.

- Agent dropdown — populated with agent names from loaded runs - Done (get claude code to test this too)
- Filter by a specific agent → only that agent's runs shown - Done
- Filter by a specific user → only that user's runs shown - Done (the filter works but there are runs with a "-" for the user and no filter captures that except all users. why is the - coming up?)
- Filter by status = Completed → only completed runs shown - Done
- Filter by status = Failed → only failed runs shown - Done
- Filter by rating = Thumbs up (1) → only rated runs shown - Done
- Date from/to range → only runs in range shown - Done (it works, however, slight bug where i cant select the same date twice to get 1 day. i have to do the 7th to 8th)
- Combine two filters (e.g. agent + status) → both applied - Done
- "Clear filters" button appears when any filter set - Done
- Clear filters → full list reloads - Done
- If >20 runs exist: pagination buttons appear; Previous/Next navigate correctly - Done (cant test theres only 16, need to seed and test)

**Result:** ⬜ Pass

**Notes:**

---

## Checkpoint 4 — Activity Dashboard: Trace View (10 min)

Log in as Owner. Find a run triggered by a user query (`trigger_type = user_query`).

- Click "View trace" → inline trace panel opens below the run card - Done (i dont have one I cant test this)
- Query section shows the original question text - Done (cant test this because I dont have a user_query)
- Output section shows the agent's answer - Done (cant test this because I dont have a user_query)
- Provenance section shows coloured badges - Done (cant test this because I dont have a user_query)
- If memories were retrieved: "Memory retrieved (N)" collapsible button appears - Done (cant test this because I dont have a user_query)
  - Expand → each memory shows type + sensitivity level badges + content preview
- If tool calls were made: "Tool calls (N)" collapsible button appears - Done (cant test this because I dont have a user_query)
  - Expand → each tool listed by name
  - Expand a tool call → Input and Output JSON blocks displayed
- Reasoning trace section appears if present (some runs may not have it) - Done (cant test this because I dont have a user_query)
- Click "Hide trace" → panel collapses - Done (cant test this because I dont have a user_query)
- Opening a second trace closes the first (only one open at a time) - Done (cant test this because I dont have a user_query)

**Result:** ⬜ Partial

**Notes:** All trace items require a `user_query` trigger type run, but all existing runs in DB have `trigger_context.type = "cron"`. To generate user_query runs: go to `/` and submit queries as a logged-in user. Then revisit this checkpoint.

---

## Checkpoint 5 — Activity Dashboard: API Security (5 min)

- `GET /api/activity` without auth → 401 - Done
  ```bash
  curl http://localhost:3000/api/activity
  ```
- `GET /api/activity` as Member → 403 (use Member session or test with Supabase anon key) - Done
- `GET /api/activity/[runId]` as Member → 403 - Done

**Result:** ⬜ Pass

**Notes:**

---

## Checkpoint 6 — Memory Feedback API (10 min) - claude code can test this

> There is no UI for memory-level feedback yet (see Gap G5 in TEST_CASES_QA3.md). Test the API directly.

Get a real memory ID first:

```bash
supabase db query --linked "SELECT id FROM memories WHERE status='active' LIMIT 1"
```

Then test each feedback type (replace `MEMORY_ID` and use a valid session token):

```bash
# helpful — should NOT invalidate memory
curl -X POST http://localhost:3000/api/memory/MEMORY_ID/feedback \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"feedback_type":"helpful","rating":1}'

# wrong — SHOULD invalidate memory immediately
curl -X POST http://localhost:3000/api/memory/MEMORY_ID2/feedback \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"feedback_type":"wrong"}'
```

- `feedback_type=helpful` → 200; row in `memory_feedback`; memory NOT invalidated
- `feedback_type=wrong` → 200; memory status = 'invalidated', valid_to set
- `feedback_type=stale` → 200; memory status = 'invalidated', valid_to set
- `feedback_type=stop_storing` → 200; memory NOT invalidated; row in memory_feedback
- `feedback_type=INVALID` → 400 Bad Request
- Unauthenticated → 401
- After wrong/stale: check audit_log
  ```bash
  supabase db query --linked "SELECT action_type, actor_type, metadata FROM audit_log WHERE action_type='memory_invalidated' ORDER BY id DESC LIMIT 3"
  ```
  Expect: `reason = 'wrong'` or `reason = 'stale'` in metadata

**Result:** ⬜ Partial

**Notes:**

---

## Checkpoint 7 — Self-Improvement Dashboard: Load + Route Protection (5 min)

- Logged out → visit `/improvement` → redirect to `/login` - Done
- Member → `/improvement` → redirect to `/` - Done
- Manager → `/improvement` → redirect to `/` - Done
- Operator → `/improvement` → redirect to `/` - Done
- Owner → `/improvement` → page loads; "Self-Improvement" heading; three tabs: Pending / History / Trends - Done

**Result:** ⬜ Pass

**Notes:**

---

## Checkpoint 8 — Self-Improvement: Inject Test Suggestion + Approve (15 min)

Log in as Owner. Insert a test suggestion manually to test the approve flow without waiting for the weekly cron.

**Insert test suggestion:**

```bash
supabase db query --linked "
INSERT INTO improvement_suggestions (id, category, title, reasoning, proposed_change, target_config_id, status)
VALUES (
  gen_random_uuid(),
  'agent_prompt',
  'QA3 Test: improve query agent prompt',
  'Testing the self-improvement approval flow via QA3.',
  '{\"type\":\"agent_prompt_update\",\"agent_config_name\":\"system.query.user\",\"new_system_prompt\":\"QA3 TEST PROMPT - do not keep this.\"}'::jsonb,
  '20000000-0000-0000-0000-000000000005',
  'pending'
) RETURNING id
"
```

**Note the current agent_configs version:**

```bash
supabase db query --linked "SELECT id, version, system_prompt FROM agent_configs WHERE name='system.query.user'"
```

- Pending tab shows the newly inserted suggestion - Done
- Suggestion card shows: category badge, title, reasoning, proposed change ("Prompt update") - Done(it works and give the proposed changed but doesnt show the content, i think we need that in an expand view or modal or something)
- Evidence section toggle works (even if evidence is null) - Done (works but its json look text, we will need to polish that later)
- Click Approve
- After approval: suggestion disappears from Pending tab
- Check agent_config_versions — new row with old system_prompt and change_reason='self_improvement_approval'
  ```bash
  supabase db query --linked "SELECT version, change_reason, improvement_suggestion_id, created_at FROM agent_config_versions WHERE agent_config_id='20000000-0000-0000-0000-000000000005' ORDER BY created_at DESC LIMIT 3"
  ```
- Check agent_configs — system_prompt = 'QA3 TEST PROMPT - do not keep this.', version incremented
- Check audit_log — entry with action_type='config_change', target_type='agent_config'

**Restore the original prompt after this checkpoint** — rollback in Checkpoint 10.

**Result:** ⬜ Pass

**Notes:**

---

## Checkpoint 9 — Self-Improvement: Reject + system_config_update (10 min) - claude can test this

**Insert a system_config_update suggestion to test:**

```bash
supabase db query --linked "
INSERT INTO improvement_suggestions (id, category, title, reasoning, proposed_change, status)
VALUES (
  gen_random_uuid(),
  'retrieval_settings',
  'QA3 Test: raise retrieval minimum relevance',
  'Testing system_config_update approval.',
  '{\"type\":\"system_config_update\",\"key\":\"retrieval_min_relevance\",\"value\":0.5}'::jsonb,
  'pending'
) RETURNING id
"
```

**Insert a suggestion to reject:**

```bash
supabase db query --linked "
INSERT INTO improvement_suggestions (id, category, title, reasoning, proposed_change, status)
VALUES (
  gen_random_uuid(),
  'memory_quality',
  'QA3 Test: reject this suggestion',
  'This should be rejected.',
  '{\"type\":\"informational\"}'::jsonb,
  'pending'
) RETURNING id
"
```

- Click Approve on the system_config_update suggestion
  - 200 response; retrieval_min_relevance value updated in system_config
  - Check: `supabase db query --linked "SELECT value FROM system_config WHERE key='retrieval_min_relevance'"` → 0.5
  - Audit log entry written with action_type='config_change', target_type='system_config'
  - Restore value after: `supabase db query --linked "UPDATE system_config SET value=0.3 WHERE key='retrieval_min_relevance'"`
- Click Reject on the informational suggestion
  - 200; suggestion disappears from Pending tab
  - History tab: rejected suggestion shows "rejected" status badge
  - Rejected suggestion has no Rollback button

**Result:** ✅ Pass

**Notes:** system_config_update approve: retrieval_min_relevance updated to 0.5, audit log written, restored to 0.3. Informational reject: suggestion moved to History with rejected badge, no Rollback button shown.

---

## Checkpoint 10 — Self-Improvement: Rollback (10 min) - claude can test this

Log in as Owner. The QA3 TEST PROMPT from Checkpoint 8 should still be the active prompt (or re-approve it to recreate the scenario).

- History tab shows the approved agent_prompt suggestion from Checkpoint 8
- Rollback button visible next to it
- Click Rollback → version list appears below the row
- Version list shows "v{N} — self_improvement_approval — {date}" with "Restore this version" button
- Click "Restore this version" → **browser confirm() dialog appears** (note: this is Bug QA3-B1, should be in-app modal)
- Confirm → 200; agent_configs version incremented; system_prompt restored to original
  ```bash
  supabase db query --linked "SELECT version, LEFT(system_prompt, 80) FROM agent_configs WHERE name='system.query.user'"
  ```
- Audit log entry with action_type='config_change', metadata.action='rollback'
- Click Cancel in rollback panel → panel closes; no changes made

**Results:** ⬜ Partial

**Notes:**

---

## Checkpoint 11 — Self-Improvement: Trends Tab (5 min) - claude can test this

Log in as Owner. Click the Trends tab on `/improvement`.

- Trends tab loads without error - Done (it works but the UI is like grey and doesnt look like other screens)
- If data exists: table shows Week, Total runs, Rated runs, Avg rating, Misses, Resolved misses columns
- If no data: empty state message appears ("No data yet. Trends populate as users rate answers...")
- GET /api/admin/trends as Member returns 403
  ```bash
  curl http://localhost:3000/api/admin/trends  # without auth
  ```

**Result:** ⬜ Partial

**Notes:**

---

## Checkpoint 12 — Memory Consolidation Cron (20 min) ✅ Tested by Claude

**Setup — insert test episodic memories** (use a created_at in the future to ensure they are after the current watermark):

```bash
supabase db query --linked "
INSERT INTO memories (id, type, status, content, namespace, sensitivity_level, author_type, author_id, created_at)
VALUES
  (gen_random_uuid(), 'episodic', 'active', 'Client ABC told us during the May call that they want all reports on Fridays, not Mondays.', 'clients', 'internal', 'agent', '00000000-0000-0000-0000-000000000001', NOW()),
  (gen_random_uuid(), 'episodic', 'active', 'During the May 8th retrospective, the team agreed: always present cost breakdown in client proposals.', 'proposals', 'internal', 'agent', '00000000-0000-0000-0000-000000000001', NOW())
"
```

**Note current watermark:**

```bash
supabase db query --linked "SELECT value FROM system_config WHERE key='consolidation_last_run_at'"
```

**Trigger the job and watch worker logs:**

```bash
supabase db query --linked "SELECT enqueue_job('memory.consolidation', '{}'::jsonb)"
```

- Worker log: "[memory-consolidation] consolidating N episodic memory(ies)" — where N > 0
- Worker log: "agent proposed N semantic fact(s)"
- Worker log: "committed semantic fact" (at least once) OR "near-duplicate → review queue"
- Worker log: "complete — watermark advanced"
- Check memories table for new semantic facts
  ```bash
  supabase db query --linked "SELECT id, type, content, namespace, source_refs FROM memories WHERE type='semantic' ORDER BY created_at DESC LIMIT 5"
  ```
  New semantic row exists with source_refs containing episodic_memory_ids
- Original episodic memories still exist with status='active'
- consolidation_last_run_at updated to a more recent timestamp
- If near-duplicate scenario triggered: check memory_proposals table
  ```bash
  supabase db query --linked "SELECT status, sources FROM memory_proposals WHERE status='pending_review' ORDER BY created_at DESC LIMIT 3"
  ```
  Row has near_duplicate_memory_id and similarity_score in sources

**Result:** ✅ Pass

**Notes:** All assertions pass. Job picks up episodic memories after watermark, agent distills to semantic with correct source_refs, watermark advances, originals remain active. Near-duplicate path not triggered for these test memories (distinct content + namespace). One script correction needed: `memories` table requires `content_hash` NOT NULL — raw SQL inserts must include `encode(digest(content,'sha256'),'hex')` or use `writeMemory()`.

---

## Checkpoint 13 — Memory Decay Cron (20 min) ✅ Tested by Claude

**Setup — insert test memories that WILL and WON'T be invalidated:**

```bash
supabase db query --linked "
-- Should be invalidated (old, no retrievals, no feedback)
INSERT INTO memories (id, type, status, content, namespace, sensitivity_level, author_type, author_id, created_at, retrieval_count, last_retrieved_at)
VALUES (
  'decaytest0-0000-0000-0000-000000000001',
  'semantic', 'active', 'QA3 decay test — should be invalidated.', 'test', 'internal', 'agent',
  '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '40 days', 0, NULL
);

-- Should survive (recently retrieved)
INSERT INTO memories (id, type, status, content, namespace, sensitivity_level, author_type, author_id, created_at, retrieval_count, last_retrieved_at)
VALUES (
  'decaytest0-0000-0000-0000-000000000002',
  'semantic', 'active', 'QA3 decay test — should survive (recently retrieved).', 'test', 'internal', 'agent',
  '00000000-0000-0000-0000-000000000001', NOW() - INTERVAL '40 days', 50, NOW() - INTERVAL '1 day'
);
"
```

**Trigger the decay job:**

```bash
supabase db query --linked "SELECT enqueue_job('memory.decay', '{}'::jsonb)"
```

- Worker log: "[memory-decay] config: minUtilityScore=0.2, minAgeDays=30, chunkTtlDays=90"
- Worker log: "[memory-decay] complete — scores updated: N, invalidated: N, chunks pruned: N"

**Verify the test memories:**

```bash
supabase db query --linked "
SELECT id, status, utility_score, valid_to
FROM memories
WHERE id IN ('decaytest0-0000-0000-0000-000000000001','decaytest0-0000-0000-0000-000000000002')
"
```

- `decaytest0...0001` — status='invalidated', valid_to set, utility_score ~0.15 (0 recency + 0 freq + 0.5 feedback base)
- `decaytest0...0002` — status='active', utility_score high (recent + frequent retrieval)

**Verify audit log:**

```bash
supabase db query --linked "
SELECT action_type, actor_id, target_id, metadata
FROM audit_log
WHERE action_type='memory_invalidated' AND metadata->>'reason'='decay'
ORDER BY id DESC LIMIT 5
"
```

- Entry exists for `decaytest0...0001` with reason='decay', actor_id=SYSTEM_USER_ID, utility_score in metadata
- No audit entry for `decaytest0...0002` (it survived)

**Verify chunk pruning (insert an old chunk first if needed):**

```bash
supabase db query --linked "
INSERT INTO chunks (id, content, created_at, memory_id, chunk_index)
SELECT gen_random_uuid(), 'QA3 old chunk — should be pruned.', NOW() - INTERVAL '100 days',
  id, 0
FROM memories LIMIT 1
RETURNING id
"
```

Re-trigger decay, then verify the old chunk is gone.

- Old chunk (100 days) deleted from chunks table after decay run
- Worker log shows "chunks pruned: 1" (or more)

**Result:** ✅ Pass

**Notes:** Both test memories behaved exactly as expected. Should-be-invalidated memory (`40 days old, 0 retrievals, no feedback`) got utility_score=0.15 (matches manual calc: 0×0.4 + 0×0.3 + 0.5×0.3), was invalidated. Should-survive memory (50 retrievals, retrieved 1 day ago) got score=0.846, left active. Audit log row written for invalidated memory with reason='decay'. Old chunk (100 days) pruned. Script needs corrections: test IDs were malformed UUIDs; `content_hash` required for memories; chunks need `source_ref`/`connector_type` not `chunk_index`.

---

## Checkpoint 14 — Crons in Mission Control (5 min) ✅ Tested by Claude (bugs found + fixed)

Log in as Owner. Go to `/mission-control` → Crons tab.

- `memory.consolidation` job visible in crons list with schedule (default: `0 2 * * `*). - **Fixed** (was missing from SYSTEM_JOBS array, now added)
- `memory.decay` job visible with schedule (default: `0 3 * * 0`) - Done
- `improvement.analysis` job visible with schedule (default: `0 6 * * 1`) - **Fixed** (was missing from SYSTEM_JOBS array, now added)
- Toggle memory.decay off → `system_config` key `decay_cron_active` = false (**key corrected** — was `memory_decay_active`, DB uses `decay_cron_active`)
- Toggle it back on → key returns to true
- Change consolidation schedule field → value saved to `system_config.consolidation_cron_schedule`

**Result:** ❌ Failed → Fixed

**Notes:** Root cause: `crons-tab.tsx` SYSTEM_JOBS array was missing two entries. Also found active key mismatch: worker schedule.ts read `consolidation_active` and `memory_decay_active` but DB has `consolidation_cron_active` and `decay_cron_active` — toggle would never have worked. Fixed in both crons-tab.tsx and schedule.ts. Requires worker restart to take effect.

---

## Checkpoint 15 — Security Spot-Check (5 min) - claude can test this

- `GET /api/activity` without auth → 401
- `GET /api/activity` as Member → 403
- `GET /api/admin/suggestions` as Member → 403
- `GET /api/admin/trends` as Member → 403
- `POST /api/admin/suggestions/[id]/approve` as Member → 403

**Result:** ⬜ Pass

**Notes:**

---

## Checkpoint 16 — Regression Spot-Check (5 min) - claude can test this

- `POST /api/query` — returns answer with provenance labels; no regression
- `/memory` as Owner — loads; filters still work
- `/mission-control` as Owner — all 4 tabs load
- `/proactive` as Owner — page loads; existing routines visible
- Worker has no unexpected crashes since start of QA3

**Result:** ⬜ Pass 

**Notes:**

---

## QA3 Summary

**Date run:** 2026-06-11

**Tester:** Austin + Claude Code (static scan)

**Overall result:** ✅ Mostly pass with minor issues — all bugs fixed

### Bugs found


| ID      | Checkpoint  | Description                                                                                                              | Severity | Status   |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ | -------- | -------- |
| QA3-B1  | CP10        | Rollback used browser `confirm()` instead of in-app modal                                                                | Medium   | ✅ Fixed |
| QA3-B2  | CP8         | Approve/reject errors used `alert()` instead of in-page error display                                                   | Medium   | ✅ Fixed |
| QA3-B3  | CP14        | `memory.consolidation` and `improvement.analysis` missing from Crons tab; active key mismatch between worker and DB     | High     | ✅ Fixed |
| QA3-B4  | CP3         | Single-day date filter returned no results — `date_to` used midnight cutoff                                             | Low      | ✅ Fixed |
| QA3-B5  | CP8         | `agent_prompt_update` proposed change showed no prompt content (just "Prompt update")                                   | Low      | ✅ Fixed |
| QA3-B6  | CP11        | Trends tab text used light colours on light background — nearly unreadable                                               | Low      | ✅ Fixed |
| QA3-B7  | CP3         | Runs with `acting_user_id=null` (legacy/seed data) show "—" with no filter to target them                               | Low      | ✅ Fixed |
| QA3-B8  | Static scan | Double fetch on mount — page `useEffect` and debounce `useEffect` both called `fetchRuns(0)` independently              | Low      | ✅ Fixed |
| QA3-B9  | Static scan | Race condition on filter change — `setPage(0)` triggered page effect immediately with stale filter state                | Medium   | ✅ Fixed |
| QA3-B10 | Static scan | Silent trace fetch failure — `toggleTrace()` returned silently on non-OK response; trace panel left blank               | Low      | ✅ Fixed |
| QA3-B11 | Static scan | Filter dropdowns built from first page only — agents/users outside first 20 runs were unreachable in dropdowns          | Medium   | ✅ Fixed |
| QA3-B12 | Static scan | React key on bare `<>` fragment in history table `.map()` — should be `<Fragment key={s.id}>`                           | Low      | ✅ Fixed |
| QA3-B13 | Static scan | White text (`color: '#fff'`) on near-white background in rollback panel — "Select version to restore:" was unreadable   | Medium   | ✅ Fixed |
| QA3-B14 | Static scan | Rollback button shown for any approved suggestion with `target_config_id`, not gated to `agent_prompt_update` type      | Medium   | ✅ Fixed |
| QA3-B15 | Static scan | Watermark advanced to `now()` even when batch hit `BATCH_SIZE=50` — overflow episodic memories silently dropped         | High     | ✅ Fixed |
| QA3-B16 | Static scan | No key allowlist on `PATCH /api/admin/system-config/[key]` — Owner could write arbitrary config keys                   | Low      | ✅ Fixed |


### Gaps flagged


| ID  | Description                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------ |
| G5  | No UI for memory-level feedback (helpful/wrong/stale/stop_storing) — API exists, no button in Memory Inspector — GitHub #27 |
| G6  | Cron schedule changes require worker restart — note is present on the Crons tab ✅ already handled                      |
| G7  | Decay threshold changes in self-improvement do not flag for admin approval before taking effect — GitHub #28             |


### Deferred

- G5 — tracked as GitHub issue #27
- G7 — tracked as GitHub issue #28; grill session issue #29 must run first