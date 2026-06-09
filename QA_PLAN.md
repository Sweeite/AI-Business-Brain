# QA Plan — Issues #11, #12, #13

> Covers: RBAC + Mission Control (Dashboard 11), Memory Inspector (Dashboard 2), Proactive Builder (Dashboard 5).
> Written against the acceptance criteria in each issue and the actual implementation in the codebase.
>
> **QA round 1** completed 2026-06-08. Results in `QA_CHECKPOINTS.md`. Bugs extracted to `FIX_BACKLOG.md`.
> **QA round 2** plan is at the bottom of this file — covers only the items that changed in the QA1 fix pass.

---

## Prerequisites

Before running any test cases, confirm the following:

1. **App is running** — `pnpm --filter @brain/app dev` starts without type errors
2. **Worker is running** — `pnpm --filter @brain/worker dev` starts and connects to pg-boss
3. **Migrations are clean** — `supabase migration list` shows all local migrations applied on remote
4. **Two test users exist** in the DB:
   - `owner@test.com` with role `Owner`
   - `member@test.com` with role `Member`
5. **At least one routine and a few memories exist** (or create them during testing)
6. **Audit log table is queryable** — you'll verify entries after mutations

---

## Issue #11 — RBAC + Mission Control

### 11.1 Route Protection

| # | Test | Expected |
|---|---|---|
| 1 | Visit `/mission-control` while logged out | Redirected to `/login` |
| 2 | Visit `/mission-control` as a Member | Returns 403 or redirect to `/` |
| 3 | Visit `/mission-control` as an Owner | Page loads with all four tabs |

### 11.2 Users Tab — Invite

| # | Test | Expected |
|---|---|---|
| 4 | Submit a valid email via "Send Invite" | Success message shown; Supabase sends invite email |
| 5 | Submit an already-registered email | Error message surfaced (Supabase will return an error) |
| 6 | Submit with empty email field | Button should remain disabled; no request sent |

### 11.3 Users Tab — Role Assignment

| # | Test | Expected |
|---|---|---|
| 7 | Change a user's role via the dropdown | `PATCH /api/admin/users/[id]` returns 200; role dropdown updates in UI |
| 8 | Immediately make a request as the updated user (e.g. hit any protected API) | New role is in effect without re-login |
| 9 | Try to change role of a deactivated user | Dropdown should be disabled for inactive users |
| 10 | Make PATCH as a Member (not Owner) | Returns 403 |

### 11.4 Users Tab — Deactivation

| # | Test | Expected |
|---|---|---|
| 11 | Click "Deactivate" on an active user | Confirm dialog appears |
| 12 | Confirm deactivation | `POST /api/admin/users/[id]/deactivate` returns 200 |
| 13 | Check `users` table | `is_active = false` |
| 14 | Check auth user | Banned for 876000h (verify in Supabase dashboard or via `auth.admin.getUserById`) |
| 15 | Check `connections` table | All connections for that user have `status = 'revoked'` |
| 16 | Check `routines` table | All active routines owned by that user set to `is_active = false` |
| 17 | Check `audit_log` | Entry with `action_type = 'user.deactivated'` |
| 18 | Deactivated user appears in users table | Status badge shows "Former employee" (not "Active") |
| 19 | Try to log in as the deactivated user | Auth should fail (banned) |
| 20 | Role dropdown should be disabled for the deactivated user | Dropdown has `disabled` attribute |

> **Known gap:** The deactivation route sets `is_active = false` but does NOT clear `users.role_id`. The issue AC says "role stripped." Verify whether this is intentional or a missing step.

### 11.5 RTBF Flow

| # | Test | Expected |
|---|---|---|
| 21 | Open RTBF modal for a deactivated user | Loading state, then list of flagged memories |
| 22 | Verify "Request RTBF" fires automatically on modal open | `POST /api/admin/users/[id]/rtbf` runs; memories with `rtbf_flagged = true` appear |
| 23 | Verify memories shown are only active memories for that author | No already-invalidated memories in the list |
| 24 | Select zero memories and click "Invalidate selected" | Button should be disabled when none selected |
| 25 | Select some memories and confirm invalidation | Selected memories disappear from list |
| 26 | Check `memories` table for invalidated records | `status = 'invalidated'`, `valid_to` is set |
| 27 | Check `audit_log` | Entry with `action_type = 'rtbf.flagged'` AND entries with `action_type = 'memory.invalidated'` and `reason: 'rtbf'` |
| 28 | Verify remaining (deselected) memories stay in the list | Not auto-deleted; only selected ones removed |
| 29 | Close and re-open the RTBF modal | Remaining flagged memories still appear |
| 30 | Try RTBF as a Member | `POST /api/admin/users/[id]/rtbf` returns 403 |

### 11.6 Roles Tab

| # | Test | Expected |
|---|---|---|
| 31 | Click "+ New Role" | Modal opens with empty name, `internal` clearance, no permission nodes |
| 32 | Save with empty name | Validation error "Name is required" |
| 33 | Create a role with name, clearance, and 2 permission nodes | Role appears in grid; refreshed from server |
| 34 | Edit an existing role | Modal pre-filled with current values |
| 35 | Add, toggle, and remove permission nodes | UI updates correctly; saved correctly |
| 36 | Delete a role (no users assigned) | Role removed from grid |
| 37 | Try to delete a role that has users assigned | Should return an error (FK constraint from users table) |
| 38 | Try role operations as a Member | All API calls return 403 |

### 11.7 Crons Tab

| # | Test | Expected |
|---|---|---|
| 39 | Crons tab loads and shows system job types | Job types visible (e.g. memory-proposal-drain, gmail-token-refresh) |
| 40 | Toggle a cron off | `PATCH /api/admin/system-config/[key]` updates `<job>_active = false` |
| 41 | Change a cron schedule | Schedule value saved to `system_config` |
| 42 | View last run timestamp per job type | Shown from `job_runs` table via `lastRunByType` prop |

> **Note:** Schedule changes take effect on next worker restart, not immediately. Verify this caveat is surfaced in the UI or document it as a known limitation.

### 11.8 Settings Tab

| # | Test | Expected |
|---|---|---|
| 43 | Settings tab displays all `system_config` keys | At minimum: `retrieval_min_relevance`, `retrieval_max_results`, `decay_min_utility_score`, `decay_min_age_days`, `chunk_ttl_days` |
| 44 | Edit a numeric setting (e.g. `retrieval_min_relevance`) | PATCH succeeds; value persisted in DB |
| 45 | Verify updated value is used by the retrieval pipeline | Run a query and confirm the new threshold is respected (integration test) |

---

## Issue #12 — Memory Inspector

### 12.1 Route Protection and Clearance Filtering

| # | Test | Expected |
|---|---|---|
| 46 | Visit `/memory` while logged out | Redirected to `/login` |
| 47 | Visit `/memory` as a Member (clearance: public or internal) | Page loads; only memories at or below user's clearance level are returned |
| 48 | Verify RLS filtering is working | A Member should NOT see `leadership` memories even if they manually call `GET /api/memory?sensitivity_level=leadership` |
| 49 | Log in as an Owner and view all memories | All sensitivity levels visible |

> Clearance filtering is enforced by RLS on the `memories` table using the `user_clearance_level()` helper. If memories are visible to users above their clearance, it's a security bug — fail immediately.

### 12.2 Filter Controls

| # | Test | Expected |
|---|---|---|
| 50 | Filter by type: Episodic / Semantic / Procedural | Only memories of that type returned |
| 51 | Filter by status: Active / Invalidated / All | Only memories in that status returned |
| 52 | Filter by sensitivity level | Only memories at that level returned |
| 53 | Filter by source: gmail / google_drive | Only memories with matching `connector_type` in `source_refs` returned |
| 54 | Filter by namespace text input | Only memories with matching namespace returned |
| 55 | Date range filter | Only memories within that `created_at` range returned |
| 56 | Text search | `ilike` match on content, debounced 300ms |
| 57 | Combine multiple filters | All filters apply simultaneously (AND logic) |
| 58 | Clear a filter | Results reset correctly |

> **Known gap:** The issue AC lists "entity (client, project, person)" as a filter control. This is **not implemented** — no entity filter exists in the UI or API. Raise as a missing acceptance criterion if needed.

### 12.3 Memory Record Display

| # | Test | Expected |
|---|---|---|
| 59 | Each card shows: type, sensitivity level, namespace, zone badges | Visible on card header |
| 60 | Source field shows connector type(s) from `source_refs` | Formatted by `formatSourceRefs()` |
| 61 | Created date and last retrieved date shown | Formatted dates in card footer |
| 62 | Invalidated records appear with "invalidated" badge and 65% opacity | Visually distinct |
| 63 | Invalidated records show the invalidation date | `valid_to` shown in footer |
| 64 | Long content truncated at 200 chars with "Show more" | Toggle expands to full content |
| 65 | Pagination works for large result sets | Previous / Next buttons; page counter |

### 12.4 Admin Mutations

| # | Test | Expected |
|---|---|---|
| 66 | Non-admin user sees no Edit / Invalidate / Broaden controls | Action buttons absent from cards |
| 67 | Admin sees Edit / Invalidate / Broaden on active memories | All three controls visible |
| 68 | Admin does NOT see Edit / Invalidate on already-invalidated memories | Actions hidden for invalidated records |
| 69 | **Invalidate** a memory | Confirm dialog → `POST /api/memory/[id]/invalidate` → record disappears from active list |
| 70 | Check `memories` table after invalidation | `status = 'invalidated'`, `valid_to` set |
| 71 | Check `audit_log` | Entry with `action_type = 'memory.invalidated'` |
| 72 | **Edit** a memory | Modal opens with current content in textarea |
| 73 | Save edit | `POST /api/memory/[id]/edit` → old record invalidated, new record created |
| 74 | New record inherits metadata (type, sensitivity, namespace, zone) | Check DB directly |
| 75 | Check `audit_log` after edit | Entry with `action_type = 'memory.edited'` or similar |
| 76 | **Broaden** a `leadership` memory to `internal` | `PATCH /api/memory/[id]/broaden` → sensitivity_level updated on the record |
| 77 | Broaden dropdown only shows more accessible levels | E.g. a `management` memory shows only `internal` and `public` as options |
| 78 | Try to broaden a `public` memory | Broaden dropdown does not appear (no levels more accessible than public) |
| 79 | Check `audit_log` after broaden | Entry logged |
| 80 | Make mutation calls as a Member | All mutation APIs return 403 |

---

## Issue #13 — Proactive Builder

### 13.1 Route Protection

| # | Test | Expected |
|---|---|---|
| 81 | Visit `/proactive` while logged out | Redirected to `/login` |
| 82 | Visit `/proactive` as a Member | Page loads; can create user routines |
| 83 | System routine scope toggle visible only for admins | `scope` field only shown when `isAdmin = true` |

### 13.2 Three-Step Wizard — Step 1: Trigger

| # | Test | Expected |
|---|---|---|
| 84 | Open "+ New Routine" | Modal opens at Step 1 |
| 85 | Select "Cron schedule" trigger | Preset buttons and custom option appear |
| 86 | Select a preset (e.g. "Daily 8am") | Cron expression set; Next button enabled |
| 87 | Select "Custom" and leave expression blank | Next button disabled |
| 88 | Enter a valid custom cron (`0 9 * * 1-5`) | Next button enabled |
| 89 | Select "Webhook event" trigger | Connector and event selects appear |
| 90 | Select Gmail connector | Event defaults to "Email received" |
| 91 | Select Google Drive connector | Event changes to "File changed" |
| 92 | Add a "from" filter (Gmail only) | Filter field visible; persisted in submission |
| 93 | "from" filter not shown for Drive webhooks | Field absent when connector = google_drive |

### 13.3 Three-Step Wizard — Step 2: Agent

| # | Test | Expected |
|---|---|---|
| 94 | Step 2 shows all existing `agent_configs` in dropdown | All DB rows present; shows name + model |
| 95 | Select an agent config | Stored; passed in submission body |
| 96 | Add optional additional context | Textarea value included in `additional_context` field |
| 97 | Leave additional context blank | `additional_context: null` in request body |
| 98 | Next button disabled if no agent configs exist (edge case) | Dropdown empty; Next disabled |

### 13.4 Three-Step Wizard — Step 3: Output

| # | Test | Expected |
|---|---|---|
| 99 | All 5 output types selectable via radio buttons | Memory, Email, Slack, Dashboard notification, Tool write |
| 100 | Select "Send email" | Recipients and subject template fields appear |
| 101 | Submit with empty recipients | Next/Create disabled (`step3Valid()` returns false) |
| 102 | Select "Post to Slack" | Channel/DM field appears |
| 103 | Select "Dashboard notification" | Role checkboxes appear (Owner, Operator, Manager, Member) |
| 104 | Select "Write to tool" | Tool name and JSON params fields appear |
| 105 | Submit with invalid JSON in params | Create button disabled |
| 106 | Routine name required | Create disabled if name is empty |
| 107 | Submit a complete cron routine (memory output) | `POST /api/routines` → 201; routine appears in list |
| 108 | Submit a complete webhook routine | Routine appears with webhook badges |
| 109 | Admin creating a system routine | `scope = 'system'` shown with hint text; saved with `scope = 'system'` |
| 110 | Member cannot create a system routine | Scope field absent in UI |

### 13.5 Routine List — Enable/Disable

| # | Test | Expected |
|---|---|---|
| 111 | Toggle a routine off | Toggle goes grey; `PATCH /api/routines/[id]` with `is_active: false` |
| 112 | Toggle a disabled routine on | Toggle goes blue; `is_active: true` in DB |
| 113 | "Run now" button disabled on a disabled routine | Button has `disabled` attribute |

### 13.6 Test Run (Run Now)

| # | Test | Expected |
|---|---|---|
| 114 | Click "Run now" on an active routine | Button shows "Running…"; pending run card appears in history |
| 115 | Worker picks up `routine.run` job | Job executes; run status transitions from `pending` → `running` → `completed`/`failed` |
| 116 | UI polls and shows final status | Run card updates (status, duration, output summary) |
| 117 | Failed run shows error text | `run.error` displayed in red |
| 118 | "Run now" on a disabled routine | Returns 400 "Routine is disabled" |

### 13.7 Run History

| # | Test | Expected |
|---|---|---|
| 119 | Select a routine in the list | Right panel shows its run history |
| 120 | Runs ordered by most recent first | Timestamps descending |
| 121 | Each run shows: status badge, triggered_by, started_at, duration, token count | All fields visible where populated |
| 122 | Output summary shown for completed runs | First 120 chars of agent output |
| 123 | New routine with no runs shows "No runs yet" empty state | Empty state message visible |

### 13.8 Deactivated User — Routines Disabled

| # | Test | Expected |
|---|---|---|
| 124 | Deactivate a user who has active routines | Routines owned by that user set to `is_active = false` (covered by Issue #11 test 16) |
| 125 | View routines as an admin after deactivation | Deactivated user's routines appear with toggle off |

### 13.9 Delete Routine

| # | Test | Expected |
|---|---|---|
| 126 | Click "Delete" on a routine | Two-step confirm appears (Confirm / Cancel) |
| 127 | Confirm delete | `DELETE /api/routines/[id]` → routine removed from list |
| 128 | Selection auto-moves to next routine in list | Right panel shows the next routine or empty state |

---

## Cross-Cutting Concerns

### Security and Authorization

| # | Test | Expected |
|---|---|---|
| 129 | All `/api/admin/` routes reject unauthenticated requests | 401 Unauthorized |
| 130 | All `/api/admin/` routes reject Member/Operator requests | 403 Forbidden |
| 131 | `GET /api/memory` returns only memories within the caller's clearance | Enforced by RLS (not post-filtered) |
| 132 | Memory mutation routes (`/invalidate`, `/edit`, `/broaden`) reject non-admin callers | 403 Forbidden |
| 133 | Routine operations respect ownership (user can't operate another user's routine) | Enforced by RLS on `routines` table |

> **Important:** The `requireOwner()` helper allows both `'Owner'` AND `'Admin'` role names. The four seeded roles are Owner/Operator/Manager/Member — there is no seeded 'Admin' role. This means only users with role name exactly `'Owner'` can access Mission Control by default. If a custom 'Admin' role is created, those users also gain access. Confirm this is the intended design.

### Audit Log Coverage

After each mutation, verify an entry in `audit_log` with:
- correct `action_type`
- `actor_id` = the acting user
- `target_type` and `target_id` matching the mutated record
- For RTBF invalidations: `metadata` includes `reason: 'rtbf'`

Audit log entries are written by the API routes, not the DB. Confirm they are present after:
- User deactivation (`user.deactivated`)
- RTBF flagging (`rtbf.flagged`)
- RTBF invalidation (check implementation in `/rtbf/invalidate/route.ts`)
- Memory invalidation, edit, broaden

### Invalidate-Don't-Overwrite

| # | Test | Expected |
|---|---|---|
| 134 | After editing a memory, verify old record preserved | Old record: `status = 'invalidated'`, `valid_to` set |
| 135 | New record created with same metadata | `type`, `sensitivity_level`, `namespace`, `zone` copied |
| 136 | RTBF invalidation follows the same pattern | Old record invalidated, not deleted |

---

## Known Gaps vs Acceptance Criteria

These are divergences found between the implementation and the issue AC. They need a decision: fix before shipping, accept as-is, or defer.

| # | Issue | AC Requirement | Current State | Recommended Action |
|---|---|---|---|---|
| G1 | #11 | "Role stripped" on deactivation | Route only sets `is_active = false`; `role_id` is NOT cleared | Decide: intentional or a missing step? |
| G2 | #11 | Schedule changes take effect immediately | Worker reads `system_config` at startup; restart required | Surface a note in the Crons UI |
| G3 | #12 | Filter by entity (client, project, person) | Not implemented in UI or API | Implement or defer to future issue |
| G4 | #13 | Test run "displays output" | Output shown in run history via polling (not inline in a modal) | Acceptable UX for async jobs; document expectation |

---

## Regression Checks

After completing issues #11–13, confirm these earlier features still work:

- `GET /api/query` — query interface returns results and provenance labels
- Memory proposal submission (`POST /api/memory/propose`) — Member proposals forced to `pending_review`
- Gmail and Drive webhook handlers — still return 200 for valid requests
- Worker cron jobs — `supabase migration list` clean; worker starts without errors
- Middleware route protection — unauthenticated users redirected to `/login` for all protected routes

---

---

# QA Round 2 — Post QA1 Fix Verification

> **Commit:** `b2db68d` — fix: resolve all QA1 bugs and access issues
> **Scope:** verify only the items that changed. Not a full re-run of QA1.
> **Prerequisites:** app running, worker running, migrations clean (`supabase migration list`), Owner and Member test accounts available.

---

## QA2-CP1 — Worker no longer crashes writing memories (B8)

| # | Test | Expected |
|---|------|----------|
| 1 | Start the worker (`pnpm --filter @brain/worker dev`) | Starts without error |
| 2 | Trigger a routine that results in `propose_memory` tool call (or run one that runs the agent) | Worker completes without `utility_score NOT NULL` crash |
| 3 | Check `memories` table for the new record | Row present with `utility_score = null`, `status = 'active'` |
| 4 | Confirm run card in Proactive Builder shows `completed` status | Run card turns green |

> If you don't have a routine that fires `propose_memory`, create one with a simple prompt and "Save to memory" output, then click Run now.

---

## QA2-CP2 — Delete routine works for routines with run history (B9)

| # | Test | Expected |
|---|------|----------|
| 5 | Find a routine that has at least one run in its history (or Run now to create one) | Run history visible in right panel |
| 6 | Click Delete → Confirm on an **active** routine with run history | Routine disappears from the list |
| 7 | Check `job_runs` table for the deleted routine's runs | Rows still exist but `routine_id = null` |
| 8 | Click Delete on a routine with **no run history** | Still works as before |
| 9 | If delete fails (e.g. FK you didn't know about), verify the error banner appears | Red banner shows error text — not a silent failure |

---

## QA2-CP3 — Source filter no longer 500s (B5)

Log in as Owner and go to `/memory`.

| # | Test | Expected |
|---|------|----------|
| 10 | Set source filter to "Gmail" | `GET /api/memory?source=gmail` returns 200; only memories with `connector: 'gmail'` in `source_refs` returned |
| 11 | Set source filter to "Google Drive" | Returns 200 with Drive memories (or 0 results if none exist — 0 is fine, 500 is not) |
| 12 | Clear the source filter | All memories return |
| 13 | Combine source filter with another filter (e.g. status = Active) | Both filters apply; no 500 |

> If you have no Gmail/Drive memories yet, filters should return 0 results with 200 status — confirm the error box does NOT appear.

---

## QA2-CP4 — Member can access Memory Inspector (A1 / A2)

Log in as a **Member** user for all of these.

| # | Test | Expected |
|---|------|----------|
| 14 | Visit `/memory` as a Member | Page loads (not redirected to `/query`) |
| 15 | Memory cards are visible, filtered to Member's clearance level | No `leadership` or `management` memories visible |
| 16 | Manually call `GET /api/memory?sensitivity_level=leadership` | Returns 0 results (RLS enforces clearance) |
| 17 | Confirm no Edit / Invalidate / Broaden buttons appear on any card | Actions section absent for Members |
| 18 | Confirm no Broaden dropdown appears | Absent |
| 19 | Visit `/memory` nav item in the sidebar | `Memory Inspector` appears in Member's nav |
| 20 | Submit `POST /api/memory/propose` as a Member (use the Remember modal on `/`) | Returns 200; proposal created with `status = 'pending_review'` |

---

## QA2-CP5 — In-app confirm modals (B1, B4, B7)

Log in as Owner for all of these. Confirm that **no browser `confirm()` or `alert()` dialogs appear anywhere**.

| # | Test | Expected |
|---|------|----------|
| 21 | Click "Deactivate" on an active user | In-app modal appears with title "Deactivate user", Cancel + Deactivate (red) buttons |
| 22 | Click Cancel in the deactivate modal | Modal closes; user remains active |
| 23 | Click Deactivate and confirm | Modal closes; user row shows "Former employee" badge |
| 24 | Click Delete on a role | In-app modal appears with "Delete role" title |
| 25 | Confirm role delete | Role removed from grid; no browser popup |
| 26 | Click Invalidate on a memory in the Memory Inspector | In-app modal appears with a truncated preview of the memory content |
| 27 | Click Cancel in the invalidate modal | Modal closes; memory remains active |
| 28 | Confirm invalidate | Memory disappears from active list (or shows invalidated badge if status = All) |
| 29 | If invalidate fails (e.g. network error) | Error shown in the error box on the page — not a browser `alert()` |

---

## QA2-CP6 — Reactivate user (B2)

| # | Test | Expected |
|---|------|----------|
| 30 | Find a deactivated user in the Users tab | Row shows "Former employee" badge + two buttons: "Reactivate" and "RTBF Review" |
| 31 | Click "Reactivate" | In-app confirm modal appears ("Reactivate user") |
| 32 | Confirm | User row shows "Active" badge; Reactivate/RTBF buttons replaced by "Deactivate" |
| 33 | Check `public.users` table | `is_active = true` |
| 34 | Check `auth.users` in Supabase dashboard | `banned_until` is null or cleared |
| 35 | Check that connections and routines are NOT auto-restored | User must reconnect/re-enable manually |
| 36 | Log in as the reactivated user | Login succeeds |
| 37 | `audit_log` has a `user.reactivated` entry | Correct `actor_id` and `target_id` |

---

## QA2-CP7 — Visual polish (B3, B6, B10, U3)

Quick visual scan — no DB queries needed.

| # | Test | Expected |
|---|------|----------|
| 38 | Open RTBF modal for a deactivated user; check nothing is selected | "Invalidate selected" button appears faded / low-opacity |
| 39 | Select one memory in the RTBF modal | Button becomes fully opaque red |
| 40 | Set a date range in Memory Inspector, then clear it | × button appears next to date inputs; clicking it clears both fields immediately |
| 41 | Toggle a routine off in Proactive Builder | "Run now" button appears faded (opacity ~45%) |
| 42 | Toggle the routine back on | "Run now" button returns to full opacity |
| 43 | Inspect the routine enable/disable toggle | Toggle shows a white sliding dot; active = blue with soft shadow; inactive = grey |

---

## QA2-CP8 — Audit log retests (R1)

Run these DB queries directly (use `supabase db query --linked` or the Supabase dashboard SQL editor).

| # | Test | Query / Action | Expected |
|---|------|---------------|----------|
| 44 | Invalidate a memory as Owner, then query audit_log | `SELECT action_type, actor_id, target_type, target_id FROM audit_log WHERE action_type = 'memory.invalidated' ORDER BY id DESC LIMIT 3;` | At least one row; `target_type = 'memory'` |
| 45 | Edit a memory as Owner (change its content), then query | `SELECT action_type FROM audit_log WHERE action_type ILIKE 'memory.edit%' ORDER BY id DESC LIMIT 3;` | Entry present |
| 46 | Broaden a memory's sensitivity level, then query | `SELECT action_type FROM audit_log WHERE action_type ILIKE '%broaden%' ORDER BY id DESC LIMIT 3;` | Entry present |
| 47 | Check all three action_types are distinct and have correct `actor_id` | Review the rows | No nulls on `actor_id`, `target_id` |

> If any of these return 0 rows, that's a new bug — log it as QA2-R1 with the missing `action_type`.

---

## QA2-CP9 — Worker connector errors (R2)

| # | Test | Expected |
|---|------|----------|
| 48 | Start the worker fresh; watch the startup logs | No crash on startup; `[worker] ready` logged |
| 49 | Trigger a routine run (click "Run now") | Run completes without `utility_score` crash in logs |
| 50 | Check worker logs for Gmail/Drive errors | Any 401 errors indicate an expired token (expected if tokens haven't been refreshed); a 500 or unhandled exception is a new bug |
| 51 | If 401 errors appear for Gmail/Drive | Mark as QA2-R2 — token refresh job may need a manual trigger or the connector needs reconnecting |

---

## QA2 Regression Spot-check

Confirm these still work after the QA1 fixes:

| # | Test | Expected |
|---|------|----------|
| 52 | `POST /api/query` with a question | Returns answer with provenance labels; no regression |
| 53 | `/mission-control` as Owner | All 4 tabs load |
| 54 | `/mission-control` as Member | Redirects to `/` (not changed by QA1 fixes) |
| 55 | Create a new routine via the wizard | Routine appears in list; Run now works |
| 56 | `supabase migration list` | All 17 migrations applied; none pending |
