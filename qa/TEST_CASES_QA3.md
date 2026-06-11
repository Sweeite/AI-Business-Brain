# QA Test Cases — Issues #14, #15, #16, #17

> Covers: Agent Activity + Full Traces (Dashboard 4), Self-Improvement Loop (Dashboard 6), Memory Consolidation Cron, Memory Decay Cron.
> Written against the acceptance criteria in each issue and the implementation as built.
>
> Use `qa/CHECKPOINTS_QA3.md` to run these as a structured session.
> Add results and notes inline using the Result and Notes columns.

---

## Prerequisites

Before running any test cases:

1. **App running** — `pnpm --filter @brain/app dev` starts without errors
2. **Worker running** — `pnpm --filter @brain/worker dev` starts and connects to pg-boss
3. **Migrations clean** — `supabase migration list` shows no pending migrations
4. **Three test users available:**
   - `owner@test.com` — role: Owner
   - `manager@test.com` — role: Manager (or promote one via Mission Control)
   - `member@test.com` — role: Member
5. **At least a few agent runs exist** — run a query on `/` to generate some, or check DB
6. **At least a few active memories exist** — needed for issues #15–17

---

## How to manually trigger worker cron jobs

> These jobs are scheduled but can be enqueued on demand for testing.

```bash
# Enqueue memory.consolidation immediately
supabase db query --linked "SELECT enqueue_job('memory.consolidation', '{}'::jsonb)"

# Enqueue memory.decay immediately
supabase db query --linked "SELECT enqueue_job('memory.decay', '{}'::jsonb)"

# Enqueue improvement.analysis immediately
supabase db query --linked "SELECT enqueue_job('improvement.analysis', '{}'::jsonb)"
```

Watch the worker logs after each command — the job should pick up within ~5 seconds.

---

## Issue #14 — Agent Activity + Full Traces

### 14.1 Route Protection

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 1 | Visit `/activity` while logged out | Redirect to `/login` | | |
| 2 | Visit `/activity` as a Member | Redirect to `/` (no access) | | |
| 3 | Visit `/activity` as a Manager | Page loads — "Agent Activity" heading visible | | |
| 4 | Visit `/activity` as an Owner | Page loads | | |

### 14.2 Run List Display

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 5 | Activity page loads with at least one existing run | Run count shown in subheading; at least one card visible | | |
| 6 | Each run card shows agent name | `agent_configs.name` shown (e.g. "system.query.user") | | |
| 7 | Each run card shows trigger type badge | Coloured badge: user_query / cron / webhook / manual | | |
| 8 | Each run card shows status badge | Coloured badge: completed (green) / failed (red) / running (amber) | | |
| 9 | Each run card shows acting user | User's full name or email shown | | |
| 10 | Each run card shows created_at timestamp | Formatted date/time in footer | | |
| 11 | Each run card shows tokens used | "Tokens: N" (or "—" if null) | | |
| 12 | Each run card shows cost_usd | "Cost: $0.0000" (or "—" if null) | | |
| 13 | Each run card shows duration_ms | Formatted as "Xs" or "Nms" (or "—" if null) | | |
| 14 | Each run card shows user rating | 👍, 👎, or "—" | | |
| 15 | Run with user_feedback shows the text | Feedback text appears in italic | | |
| 16 | Empty state: no runs match filters | "No agent runs match the current filters." shown | | |

### 14.3 Filters

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 17 | Agent filter dropdown shows agents from loaded runs | Dropdown populated with unique agent names | | |
| 18 | Filter by a specific agent | Only that agent's runs shown | | |
| 19 | User filter dropdown shows users from loaded runs | Dropdown populated with unique user names/emails | | |
| 20 | Filter by a specific user | Only that user's runs shown | | |
| 21 | Filter by status: Completed | Only completed runs shown | | |
| 22 | Filter by status: Failed | Only failed runs shown | | |
| 23 | Filter by rating: Thumbs up (1) | Only thumbs-up rated runs shown | | |
| 24 | Filter by rating: Thumbs down (-1) | Only thumbs-down runs shown | | |
| 25 | Filter by rating: Neutral (0) | Only runs with rating=0 shown | | |
| 26 | Date from filter | Only runs after the selected date shown | | |
| 27 | Date to filter | Only runs before the selected date shown | | |
| 28 | Combine two filters (e.g. agent + status) | Both filters applied simultaneously | | |
| 29 | "Clear filters" button appears when any filter is active | Button visible only when at least one filter set | | |
| 30 | Click "Clear filters" | All filters reset; full run list reloads | | |
| 31 | Filter changes trigger a new fetch (debounced 300ms) | Results update without full page reload | | |

### 14.4 Pagination

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 32 | More than 20 runs exist | Previous/Next buttons appear; "Page 1 of N" shown | | |
| 33 | Click Next | Page 2 loads; page counter updates | | |
| 34 | Click Previous on page 2 | Returns to page 1 | | |
| 35 | Previous button disabled on page 1 | Button has `disabled` attribute on first page | | |
| 36 | Next button disabled on last page | Button has `disabled` attribute on last page | | |

### 14.5 Trace View

For these tests, use a run that was triggered by a user query (trigger_type = user_query).

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 37 | Click "View trace" on a run | Trace panel opens inline below that run's card | | |
| 38 | Trace shows query text (user_query runs only) | "Query" section with the original question text shown | | |
| 39 | Trace shows output text | "Output" section with agent response | | |
| 40 | Trace shows provenance labels | "Provenance" section with coloured badges (e.g. "I know this") | | |
| 41 | Trace shows "Memory retrieved" section if memories were used | Collapsible "Memory retrieved (N)" button visible | | |
| 42 | Expand memory section | Each memory shows type badge, sensitivity level badge, content preview (300 chars) | | |
| 43 | Trace shows "Tool calls" section if tools were used | Collapsible "Tool calls (N)" button visible | | |
| 44 | Expand tool calls section | Each tool call listed by name; expandable with input + output as JSON | | |
| 45 | Expand a tool call | Input and output JSON blocks displayed; max-height scrollable | | |
| 46 | Reasoning trace section shown if present | Collapsible "Reasoning trace" section | | |
| 47 | Click "Hide trace" | Trace panel collapses | | |
| 48 | Open two traces at once | Only one trace open at a time; previous trace closes when new one opens | | |

### 14.6 API Security

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 49 | `GET /api/activity` without auth | 401 Unauthorized | | |
| 50 | `GET /api/activity` as a Member | 403 Forbidden | | |
| 51 | `GET /api/activity/[runId]` as a Member | 403 Forbidden | | |
| 52 | Query text visible in trace (stored in trigger_context) | Only accessible to Manager+ — Member cannot call this endpoint | | |

---

## Issue #15 — Self-Improvement Loop

### 15.1 Memory Feedback Endpoint

> The API endpoint exists at `POST /api/memory/[id]/feedback`. Test it directly with curl or a REST client since there is no UI for memory-level feedback in the Memory Inspector yet (see Gap G5 below).

```bash
# Replace MEMORY_ID with a real memory id, and include your session cookie or Bearer token
curl -X POST http://localhost:3000/api/memory/MEMORY_ID/feedback \
  -H "Content-Type: application/json" \
  -d '{"feedback_type":"helpful","rating":1,"note":"Good memory"}'
```

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 53 | POST feedback_type=helpful | 200 `{ok: true}`; row inserted in memory_feedback | | |
| 54 | POST feedback_type=wrong | 200; row in memory_feedback AND memory status=invalidated | | |
| 55 | POST feedback_type=stale | 200; row in memory_feedback AND memory status=invalidated | | |
| 56 | POST feedback_type=stop_storing | 200; row in memory_feedback; memory NOT invalidated | | |
| 57 | POST feedback_type=invalid_value | 400 Bad Request | | |
| 58 | POST without auth | 401 Unauthorized | | |
| 59 | Confirm memory_feedback row structure | memory_id, user_id, feedback_type, rating, note all present | | |
| 60 | After wrong/stale: check audit_log | Entry with action_type = 'memory_invalidated', metadata.reason = 'wrong' or 'stale' | | |
| 61 | Wrong/stale on already-invalidated memory | No error; memory stays invalidated; no duplicate audit entry | | |

### 15.2 Self-Improvement Dashboard — Route Protection

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 62 | Visit `/improvement` while logged out | Redirect to `/login` | | |
| 63 | Visit `/improvement` as a Member | Redirect to `/` | | |
| 64 | Visit `/improvement` as a Manager | Redirect to `/` | | |
| 65 | Visit `/improvement` as an Operator | Redirect to `/` | | |
| 66 | Visit `/improvement` as an Owner | Page loads — "Self-Improvement" heading visible | | |

### 15.3 Pending Suggestions Tab

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 67 | Improvement dashboard loads with Pending tab active | "Pending (N)" tab shown with count | | |
| 68 | Empty pending state | "No pending suggestions. The analysis cron runs Monday 6am." message | | |
| 69 | Pending suggestion card shows category badge | Coloured badge (e.g. "agent prompt", "memory quality") | | |
| 70 | Card shows target config name | Config name shown in monospace next to badge | | |
| 71 | Card shows title, reasoning, proposed_change summary | All three visible on card | | |
| 72 | Proposed change type label shown | "Prompt update" / "Config update" / "Informational" | | |
| 73 | Evidence section collapsible | "Show evidence" / "Hide evidence" toggle works | | |
| 74 | Evidence shown as formatted JSON | Pre-formatted JSON block | | |

### 15.4 Approve Flow

**Setup:** Manually insert a test suggestion into `improvement_suggestions` with status='pending' if none exist from the cron.

```sql
-- Insert a test agent_prompt_update suggestion
INSERT INTO improvement_suggestions (id, category, title, reasoning, proposed_change, target_config_id, status)
VALUES (
  gen_random_uuid(),
  'agent_prompt',
  'Test: improve query agent',
  'Testing the approval flow.',
  '{"type":"agent_prompt_update","agent_config_name":"system.query.user","new_system_prompt":"Test updated prompt."}'::jsonb,
  '20000000-0000-0000-0000-000000000005',
  'pending'
);
```

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 75 | Click Approve on an agent_prompt_update suggestion | POST /api/admin/suggestions/[id]/approve returns 200 | | |
| 76 | After approval: check agent_config_versions | Row inserted with old system_prompt, correct version number, change_reason='self_improvement_approval' | | |
| 77 | After approval: check agent_configs | system_prompt updated to new value; version incremented by 1 | | |
| 78 | After approval: audit_log entry | action_type='config_change', target_type='agent_config', metadata has improvement_suggestion_id | | |
| 79 | After approval: suggestion disappears from Pending tab | Suggestion moves to History tab | | |
| 80 | Click Approve on a system_config_update suggestion | 200; system_config row updated with new value | | |
| 81 | After system_config_update approval: audit_log entry | action_type='config_change', target_type='system_config' | | |
| 82 | Click Approve on an informational suggestion | 200; suggestion marked approved; no DB config change | | |
| 83 | POST /api/admin/suggestions/[id]/approve as Member | 403 | | |

### 15.5 Reject Flow

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 84 | Click Reject on a pending suggestion | POST /api/admin/suggestions/[id]/reject returns 200 | | |
| 85 | After rejection: suggestion disappears from Pending tab | Suggestion moves to History tab | | |
| 86 | History tab shows rejected suggestion | status badge shows "rejected" | | |
| 87 | POST /api/admin/suggestions/[id]/reject as Member | 403 | | |

### 15.6 History Tab + Rollback Flow

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 88 | History tab shows approved and rejected suggestions | Both statuses visible; colour-coded badges | | |
| 89 | Approved agent_prompt suggestion shows Rollback button | Button visible in Actions column | | |
| 90 | Rejected suggestion has no Rollback button | Actions cell empty for rejected entries | | |
| 91 | Click Rollback on approved suggestion | Version list loads below the row | | |
| 92 | Version list shows v-number, change_reason, date | All three visible per version row | | |
| 93 | Click "Restore this version" | Browser confirm() dialog appears (NOTE: this is a UX bug — should be in-app modal) | | |
| 94 | Confirm restore | POST /api/admin/agent-configs/[id]/rollback returns 200; agent_configs version incremented | | |
| 95 | After rollback: agent_configs.system_prompt | Matches the selected version's system_prompt | | |
| 96 | After rollback: a new agent_config_versions row exists | change_reason='rollback'; archived the pre-rollback state | | |
| 97 | After rollback: audit_log entry | action_type='config_change', metadata.action='rollback' | | |
| 98 | Click Cancel in rollback panel | Version panel closes; no changes made | | |

### 15.7 Trends Tab

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 99 | Switch to Trends tab | Table loads with up to 8 weeks of data | | |
| 100 | Columns shown | Week, Total runs, Rated runs, Avg rating, Misses, Resolved misses | | |
| 101 | Avg rating shows ↑ or ↓ arrow in column header when trend detected | Arrow appears in "Avg rating" header when 2+ rated weeks exist | | |
| 102 | Miss count column highlighted red when count > 5 | Red text for high miss weeks | | |
| 103 | Empty state when no data | "No data yet. Trends populate as users rate answers..." message | | |
| 104 | GET /api/admin/trends as Member | 403 | | |

---

## Issue #16 — Memory Consolidation Cron

> Most of these tests require manually triggering the job and checking logs + DB state.
> Use `supabase db query --linked "SELECT enqueue_job('memory.consolidation', '{}'::jsonb)"` to trigger.

### 16.1 Job Registration + Schedule

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 105 | Worker starts — logs show memory.consolidation scheduled | `[worker] scheduled memory.consolidation @ 0 2 * * *` in startup logs | | |
| 106 | Crons tab in Mission Control shows memory.consolidation job | Job listed with schedule and active toggle | | |
| 107 | system_config has consolidation_cron_schedule key | `supabase db query --linked "SELECT key,value FROM system_config WHERE key='consolidation_cron_schedule'"` → row exists | | |
| 108 | system_config has consolidation_last_run_at key | Key exists; value is ISO timestamp or null | | |

### 16.2 Watermark Guard

**Setup:** Note the current value of `consolidation_last_run_at`. Ensure a few episodic memories exist older than that value.

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 109 | Trigger job when no episodic memories exist after watermark | Worker log: "[memory-consolidation] no new episodic memories to consolidate"; watermark still advances | | |
| 110 | Trigger job when episodic memories exist after watermark | Worker processes them; logs show count | | |
| 111 | After successful run: consolidation_last_run_at updated | Value is later than the value before triggering | | |
| 112 | Watermark updated AFTER processing (not before) | If agent fails, check that watermark is NOT updated (force error by deactivating the agent config, trigger job, re-activate) | | |

### 16.3 Consolidation Behaviour

**Setup:** Insert 2–3 episodic memories with recent created_at (after the current watermark) and varying namespaces.

```sql
INSERT INTO memories (id, type, status, content, namespace, sensitivity_level, author_type, author_id)
VALUES
  (gen_random_uuid(), 'episodic', 'active', 'Client X said they prefer weekly emails over monthly reports during the April 3rd call.', 'clients', 'internal', 'agent', '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'episodic', 'active', 'In the April 5th debrief, the team agreed to always include a summary slide in proposals.', 'proposals', 'internal', 'agent', '00000000-0000-0000-0000-000000000001');
```

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 113 | Trigger consolidation after inserting test episodic memories | Worker log shows "consolidating N episodic memory(ies)" | | |
| 114 | Agent produces semantic facts | Worker log: "agent proposed N semantic fact(s)" | | |
| 115 | Semantic fact committed to memories table | New row with type='semantic', status='active', source_refs contains episodic_memory_ids | | |
| 116 | Committed semantic fact has correct namespace and sensitivity_level | Matches the originating episodic memories | | |
| 117 | Episodic memories NOT deleted after consolidation | Original episodic rows still exist with status='active' | | |

### 16.4 Near-Duplicate Routing

**Setup:** Run consolidation once so a semantic memory exists. Then insert a new episodic memory that would produce a nearly identical semantic fact.

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 118 | Second consolidation run produces near-duplicate (similarity ≥ 0.92) | Worker log: "near-duplicate (similarity=0.9X) → review queue" | | |
| 119 | Near-duplicate routed to memory_proposals | Row in memory_proposals with status='pending_review', sources.near_duplicate_memory_id set, sources.similarity_score set | | |
| 120 | Non-duplicate fact committed to memories | New semantic memory row created; memory_proposals NOT used | | |

### 16.5 Content Hash Dedup

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 121 | Trigger consolidation twice on the same episodic memories (reset watermark) | Second run: writeMemory dedup — no duplicate semantic fact committed (skipped=true in logs) | | |

---

## Issue #17 — Memory Decay Cron

> These tests require triggering the job and checking logs + DB state.
> Use `supabase db query --linked "SELECT enqueue_job('memory.decay', '{}'::jsonb)"` to trigger.

### 17.1 Job Registration + Schedule

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 122 | Worker starts — logs show memory.decay scheduled | `[worker] scheduled memory.decay @ 0 3 * * 0` in startup logs | | |
| 123 | Crons tab shows memory.decay job | Listed with Sunday 3am schedule and active toggle | | |
| 124 | system_config has decay_min_utility_score key | `SELECT value FROM system_config WHERE key='decay_min_utility_score'` → 0.2 | | |
| 125 | system_config has decay_min_age_days key | Value = 30 | | |
| 126 | system_config has chunk_ttl_days key | Value = 90 | | |
| 127 | system_config has decay_cron_schedule key | Value is a valid cron expression | | |

### 17.2 Utility Score Computation

**Setup:** Insert a test memory with known retrieval stats to verify the formula. Use an age > 30 days so it qualifies.

```sql
-- Insert a qualifying test memory (age > 30 days, no retrieval, no feedback)
INSERT INTO memories (id, type, status, content, namespace, sensitivity_level, author_type, author_id, created_at, retrieval_count, last_retrieved_at)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'semantic', 'active', 'Test decay memory — no retrievals, no feedback.', 'test', 'internal', 'agent',
  '00000000-0000-0000-0000-000000000001',
  NOW() - INTERVAL '40 days',
  0, NULL
);
```

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 128 | Trigger decay after inserting the test memory | Worker log: "[memory-decay] config: minUtilityScore=0.2, minAgeDays=30..." | | |
| 129 | Memory with retrieval_count=0, last_retrieved=null: recency=0 | utility_score = (0 × 0.4) + (0 × 0.3) + (0.5 × 0.3) = 0.15; should be invalidated (0.15 < 0.2) | | |
| 130 | Worker logs show scores_updated and invalidated counts | "[memory-decay] complete — scores updated: N, invalidated: N, chunks pruned: N" | | |
| 131 | utility_score column updated in memories table | SELECT utility_score FROM memories WHERE id='aaaaaaaa-...' → 0.15 (approximately) | | |
| 132 | Invalidated memory has status=invalidated, valid_to set | SELECT status, valid_to FROM memories WHERE id='aaaaaaaa-...' | | |

### 17.3 Invalidation Rules

**Setup:** Insert two memories — one that should be invalidated (low score + old) and one that should survive (high retrieval count).

```sql
-- Memory that should survive: high retrieval count
INSERT INTO memories (id, type, status, content, namespace, sensitivity_level, author_type, author_id, created_at, retrieval_count, last_retrieved_at)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'semantic', 'active', 'High-retrieval test memory.', 'test', 'internal', 'agent',
  '00000000-0000-0000-0000-000000000001',
  NOW() - INTERVAL '40 days',
  100, NOW() - INTERVAL '1 day'
);
```

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 133 | High-retrieval memory NOT invalidated | memory 'bbbbbbbb...' remains status='active' after decay run | | |
| 134 | Memory younger than decay_min_age_days NOT processed | A memory created 5 days ago is not touched (age check passes it over) | | |
| 135 | Memory exactly at score threshold NOT invalidated | Memory with utility_score = 0.2 (equal to threshold) survives — condition is strictly less than | | |

### 17.4 Audit Log for Decay Invalidations

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 136 | After decay run: audit_log entries for invalidated memories | `SELECT * FROM audit_log WHERE action_type='memory_invalidated' AND metadata->>'reason'='decay' ORDER BY id DESC LIMIT 5` | | |
| 137 | Audit log entry has actor_id = SYSTEM_USER_ID | actor_id = '00000000-0000-0000-0000-000000000001' | | |
| 138 | Audit log entry has metadata.utility_score | metadata field shows the computed score | | |

### 17.5 Chunk TTL Pruning

**Setup:** Insert an old chunk row.

```sql
INSERT INTO chunks (id, content, created_at, memory_id, chunk_index, embedding)
VALUES (
  gen_random_uuid(), 'Old test chunk.', NOW() - INTERVAL '100 days',
  (SELECT id FROM memories LIMIT 1), 0, NULL
);
```

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 139 | Trigger decay; check chunks table | Chunk older than chunk_ttl_days (90) is hard-deleted | | |
| 140 | Chunk within TTL not deleted | A chunk created 30 days ago still exists after the run | | |
| 141 | Worker logs show chunk prune count | "chunks pruned: N" in the completion log | | |

---

## Cross-Cutting Concerns (Issues #14–17)

### Security

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 142 | GET /api/activity unauthenticated | 401 | | |
| 143 | GET /api/activity as Member | 403 | | |
| 144 | GET /api/admin/suggestions unauthenticated | 401 | | |
| 145 | GET /api/admin/suggestions as Member | 403 | | |
| 146 | GET /api/admin/suggestions as Manager | 403 | | |
| 147 | GET /api/admin/trends as Member | 403 | | |
| 148 | POST /api/admin/suggestions/[id]/approve as Member | 403 | | |
| 149 | POST /api/admin/agent-configs/[id]/rollback as Member | 403 | | |

### Cron Configuration via Mission Control

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 150 | Crons tab shows memory.consolidation and memory.decay | Both jobs visible in the crons list | | |
| 151 | Toggle memory.decay off → system_config updated | system_config key 'memory_decay_active' = false; worker restart would unschedule job | | |
| 152 | Change memory.consolidation schedule → system_config updated | Value in system_config.consolidation_cron_schedule updated | | |

### Regression

| # | Test | Expected | Result | Notes |
|---|---|---|---|---|
| 153 | POST /api/query still works after all changes | Returns answer with provenance labels; no regression | | |
| 154 | Memory Inspector /memory still loads | Page loads; filters still work | | |
| 155 | Mission Control /mission-control still loads for Owner | All 4 tabs load; no regression | | |
| 156 | Proactive Builder /proactive still loads; Run now still works | No regression | | |

---

## Known Gaps vs Acceptance Criteria

| # | Issue | AC Requirement | Current State | Recommended Action |
|---|---|---|---|---|
| G5 | #15 | "Thumbs up/down + feedback_type recorded on every memory record" | API exists (`POST /api/memory/[id]/feedback`) but **no UI** in the Memory Inspector to invoke it | Add feedback controls to each memory card in the inspector |
| G6 | #15 | Rollback confirmation should be in-app modal | Uses browser `confirm()` dialog (same pattern as QA1 bugs B1/B4/B7) | Replace with in-app ConfirmModal |
| G7 | #15 | Approve/reject errors should surface in-page | Uses `alert()` for error messages — same as QA1 pattern | Use in-page error box or toast |
| G8 | #15 | retrieval_count and last_retrieved_at updated on every memory retrieval | Implemented in `retrieveMemories()` — verify this is firing correctly on user queries | Spot-check via DB after running a query |
| G9 | #15 | miss_log.resolved set when knowledge gap is filled | Implemented via heuristic in improvement-analysis worker (resolves misses >14 days old if new memories written) | May not be granular enough — verify the logic works for the intended use case |
| G10 | #16 | Schedule change takes effect on worker restart | Same as G2 from QA1 — worker must be restarted for schedule changes to apply | Ensure the Crons tab still shows the restart note |
| G11 | #17 | Decay threshold changes flag in self-improvement dashboard as requiring admin approval | **Not implemented** — threshold changes apply immediately when approved via the improvement dashboard | Decide: implement the flag mechanism or document as deferred |
