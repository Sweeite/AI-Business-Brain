# QA Checkpoints

Work through these in order. Each one is 5–15 minutes. Full detail for every check is in `QA_PLAN.md`.

---

## Checkpoint 1 — Environment (5 min) - Done

- `pnpm --filter @brain/app dev` starts with no errors - Done
- `pnpm --filter @brain/worker dev` starts and connects to pg-boss - Done
- `supabase migration list` — all migrations applied, none pending - Done
- You can log in as an Owner-role user ([austinsmith1704@gmail.com](mailto:austinsmith1704@gmail.com)) - Done
- You can log in as a Member-role user ([austin@transpera.ai](mailto:austin@transpera.ai)) - Done

---

## Checkpoint 2 — Mission Control: Access + Users Table (10 min) - Done

- Logged out → visit `/mission-control` → redirected to `/login` - Done
- Logged in as Member → visit `/mission-control` → 403 or redirect - Done
- Logged in as Owner → `/mission-control` loads with 4 tabs (Users, Roles, Cron Jobs, Settings) - Done
- Users table shows existing users with email, name, role, status - Done
- "Invite User" form — submitting a valid email shows "Invite sent." and sends the Supabase invite email - Done
- Submitting an empty email — Send Invite button stays disabled - Done

---

## Checkpoint 3 — Mission Control: Role Change + Deactivation (15 min) - Done

- Change a user's role via the dropdown → `PATCH` returns 200 → dropdown updates in UI - Done
- Make a request as that user immediately (no re-login) → new role is in effect - Done
- Click "Deactivate" on an active user → confirm dialog appears - Done (works but its like the browser confirmation, not in app. we need to fix this. we also need a way to reactivate them.)
- Confirm → `users.is_active = false` in DB - Done
- Auth user is banned (check Supabase dashboard or query auth.users) - Done
- All that user's `connections` have `status = 'revoked'` - Done
- All that user's active `routines` set to `is_active = false` - Done
- `audit_log` has an entry with `action_type = 'user.deactivated'` - Done
- Deactivated user shows "Former employee" badge in the table - Done
- Role dropdown for deactivated user is disabled - Done

> Flag to check: does `users.role_id` get cleared on deactivation? (Currently it does NOT — see Gap G1 in QA_PLAN.md)

---

## Checkpoint 4 — Mission Control: RTBF Flow (10 min) - Done

- Click "RTBF Review" on a deactivated user → modal opens and loads their memories - Done
- Memories shown are only active records authored by that user - Done
- "Invalidate selected" button is disabled when nothing is checked - Done (the button doesnt work but its still bright red as if it should do something)
- Check some memories → click Invalidate → selected memories disappear from the list - Done
- Deselected memories remain in the list (not auto-deleted) - Done
- `audit_log` has entries for `rtbf.flagged` and the invalidation(s) - Done
- Can close and re-open the modal — remaining flagged memories still appear - Done

---

## Checkpoint 5 — Mission Control: Roles Tab (10 min) - Done

- Click "+ New Role" → modal opens with empty name, `Internal` clearance, no permission nodes - Done
- Submit with no name → validation error "Name is required" - Done
- Create a role with a name, a clearance level, and 2 permission nodes → appears in grid - Done (This works but i need a permission node selector and this needs to be easy with good names and desciptions)
- Edit that role → modal pre-filled with current values; changes save correctly - Done
- Add and remove permission nodes in the editor - Done
- Delete the role → removed from grid - Done (works but confirmation pop up is the browser version not in app. we need htis to be a global change where its in app)
- Try deleting a role that has users assigned → should error (FK constraint) - Done

---

## Checkpoint 6 — Mission Control: Crons + Settings Tabs (10 min) - Done

**Crons**

- Crons tab loads and shows job types (e.g. memory-proposal-drain, gmail-token-refresh) - Done
- Toggle a cron off → `system_config` updates, toggle reflects the change - Done
- Change a cron schedule → value saved to `system_config` - Done
- Last run timestamp visible per job type - Done

**Settings**

- Settings tab shows at minimum: `retrieval_min_relevance`, `retrieval_max_results`, decay keys, `chunk_ttl_days` - Done
- Edit a value (e.g. `retrieval_min_relevance`) → PATCH succeeds → value persists in DB - Done

---

## Checkpoint 7 — Memory Inspector: Load + Filters (10 min) - Done

- `/memory` loads as a logged-in user — record count shown, cards visible - Done
- Filter by type (Episodic / Semantic / Procedural) → only that type shown - Done
- Filter by status: Active / Invalidated / All → results change correctly - Done
- Filter by sensitivity level → only that level returned - Done
- Filter by source (gmail / google_drive) → only matching records returned - Done (both dont work i get this error "operator does not exist: jsonb ~~* unknown", GET /api/memory?page=0&status=active&source=gmail 500 in 257ms
 GET /api/memory?page=0&status=active&source=google_drive 500 in 160ms)
- Text search → cards update after 300ms debounce - Done
- Date range filters work (set from/to and verify results) - Done (it works but no easy way to reset date range)
- Combine two or more filters → all applied simultaneously - Done

> Flag to check: there is NO entity filter (client/project/person) — see Gap G3 in QA_PLAN.md

---

## Checkpoint 8 — Memory Inspector: Clearance Security (5 min) - Done

This is a security check — do it carefully.

- Log in as a Member (clearance: public or internal) - Done
- Visit `/memory` — confirm no `leadership` or `management` memories appear in the list - Done (/memory redirects to /query)
- Manually call `GET /api/memory?sensitivity_level=leadership` — still returns 0 results for this user
- Log in as an Owner — confirm all sensitivity levels are visible - Done
- Non-admin user sees NO Edit / Invalidate / Broaden buttons on any card - Done ( cant see this as i cant access /memory as memeber)

---

## Checkpoint 9 — Memory Inspector: Admin Mutations (15 min) - Done

Log in as Owner for all of these.

**Invalidate**

- Click "Invalidate" on an active memory → confirm dialog → memory disappears from active list - Done (it works but it has the browser confimation modal, it should be in app)
- `memories` table: `status = 'invalidated'`, `valid_to` is set - Done
- `audit_log` has an entry for the invalidation - Done (i think this is working, maybe ned help testing it)
- Memory reappears when switching status filter to "Invalidated" - Done

**Edit**

- Click "Edit" → modal opens with current content - Done
- Save a change → old record invalidated, new record created with updated content - Done
- New record inherits type, sensitivity_level, namespace, zone from the old one - Done (i think its working need help testing)

**Broaden**

- On a `leadership` memory — Broaden dropdown shows `management`, `internal`, `public` - Done
- On a `public` memory — no Broaden dropdown (already at broadest level) - Done
- Broaden `leadership` → `internal` → sensitivity_level updated in DB - Done
- `audit_log` has an entry for the broaden - Done (i think it worked, might need help testing)

---

## Checkpoint 10 — Proactive Builder: Create Routines (15 min) - Done

**Cron routine**

- Click "+ New Routine" → wizard opens at Step 1 - Done
- Select "Cron schedule" → pick a preset (e.g. Daily 8am) → Next enabled - Done
- Try "Custom" with blank expression → Next stays disabled - Done
- Enter a valid custom cron → Next enabled - Done (works but this is not user friendly if you do not understand cron we need to make it like a proper builder where anyone can understand it)
- Step 2: select an agent config → Next enabled - Done
- Step 3: enter a name, pick "Save to memory" output → Create Routine - Done
- Routine appears in the list with cron badge and correct schedule shown - Done (works, toggle switch is jsut. ablue dont. this needs to be polished)

**Webhook routine**

- New routine → Step 1 → "Webhook event" - Done
- Select Gmail / "Email received" → add a "from" filter → Next - Done
- Complete Steps 2 + 3 → routine appears with webhook badge - Done
- "from" filter shows for Gmail; not shown when switching to Google Drive connector - Done

**System scope (as Owner)**

- On Step 3, "Scope" toggle appears for admins - Done
- Create a system routine → shows `system` badge in list - Done
- Log in as Member and open the wizard → Scope field is absent - Done (cant test this as member role cant access anythign but /query)

---

## Checkpoint 11 — Proactive Builder: Manage Routines (10 min) - Done

- Toggle a routine off → toggle goes grey, `is_active = false` in DB - Done
- Toggle it back on → toggle goes blue, `is_active = true` in DB - Done
- "Run now" is disabled on a disabled routine - Done (it works but the button stays vibrant, if disabled should be greyed out a little)
- Enable routine → click "Run now" → button shows "Running…"; a pending run appears in the right panel - Done
- Worker processes the job → run card updates to `completed` or `failed` via polling - Done (failed with this error Failed to write memory: null value in column "utility_score" of relation "memories" violates not-null constraint)
- Completed run shows duration, token count, and output summary - Done (i cant see this due to error)
- Failed run shows error text in red - Done
- Click "Delete" → two-step confirm appears → confirm → routine removed from list - Done (worked once for a deactive one, but when i try to delete an active one it doent work. then when i deactivate and try to delete it still doesnt work)

---

## Checkpoint 12 — Cross-Cutting + Regression (10 min) - Done

**Audit log spot check**

- Query `audit_log` directly and confirm entries exist for the mutations you made today - Done, (i think it worked. i was able to find most but not all, might need to retest this later)
- Each entry has: `actor_id`, `target_type`, `target_id`, `action_type` - Done

**Security quick-check**

- Call any `/api/admin/` endpoint without auth → 401 - Done
- Call any `/api/admin/` endpoint as a Member → 403 - Done

**Regression — earlier features still work**

- `POST /api/query` with a test question returns an answer with provenance labels - Done (still works, but noticed the agent is dub and cant even query what time it is, we need to give it access to more tools, but this is expected)
- `POST /api/memory/propose` as a Member creates a proposal with `status = 'pending_review'` - Done (i dont have access to this as memeber)
- `/login` page loads and Google OAuth redirect works - Done
- Worker logs show no unexpected crashes since starting - Done we are getting an error with gmail and gdrive. request the logs when we fix)

---

## Done

All 12 checkpoints complete. Open `QA_PLAN.md` → "Known Gaps" section for the 4 items that need a decision before this is fully closed.