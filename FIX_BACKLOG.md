# Fix Backlog

---

## QA1 — Issues found during QA round 1 (2026-06-08)

**Status: fixed 2026-06-09** — all B and A items resolved; U1/U2 deferred to issues #23/#24 (planning in #25); G1 documented as intentional.

These items were discovered while working through `QA_CHECKPOINTS.md` against issues #11, #12, and #13.

---

### Bugs

| ID | Status | Checkpoint | Severity | Description | Fix |
|----|--------|-----------|----------|-------------|-----|
| QA1-B1 | ✅ Fixed | CP3 | High | Deactivate user uses browser `confirm()` | Shared `ConfirmModal` component wired in `users-tab.tsx` |
| QA1-B2 | ✅ Fixed | CP3 | High | No way to reactivate a deactivated user | New `POST /api/admin/users/[id]/reactivate` + Reactivate button in Users tab |
| QA1-B3 | ✅ Fixed | CP4 | Medium | RTBF Invalidate button stays bright red when nothing selected | `opacity: 0.45 / cursor: not-allowed` when `rtbfSelected.size === 0` |
| QA1-B4 | ✅ Fixed | CP5 | High | Delete role uses browser `confirm()` | `ConfirmModal` wired in `roles-tab.tsx` |
| QA1-B5 | ✅ Fixed | CP7 | High | Source filter throws 500 — `jsonb ~~* unknown` | Changed to `.contains('source_refs', { connector: source })` — correct key + `@>` operator |
| QA1-B6 | ✅ Fixed | CP7 | Low | Date range filter has no reset button | × clear button shown when either date field has a value |
| QA1-B7 | ✅ Fixed | CP9 | High | Memory Invalidate uses browser `confirm()` / `alert()` | `ConfirmModal` wired in `memory-inspector-client.tsx`; errors now use `setError` |
| QA1-B8 | ✅ Fixed | CP11 | High | Worker crashes writing memory: `utility_score NOT NULL` constraint | Migration `20260612000001` drops the erroneous NOT NULL on `memories.utility_score` |
| QA1-B9 | ✅ Fixed | CP11 | High | Delete routine silently fails for routines with run history | Migration `20260612000002` changes FK to `ON DELETE SET NULL`; client now shows error banner on failed delete |
| QA1-B10 | ✅ Fixed | CP11 | Low | Run now button stays vibrant when routine is disabled | `opacity: 0.45` applied when `!r.is_active` |

---

### Polish / UX Improvements

| ID | Status | Checkpoint | Description | Fix |
|----|--------|-----------|-------------|-----|
| QA1-U1 | ⏳ Deferred | CP5 | Permission node editor needs predefined selector with names/descriptions | Issue #23 — blocked on planning issue #25 |
| QA1-U2 | ⏳ Deferred | CP10 | Custom cron expression needs a visual schedule builder | Issue #24 — blocked on planning issue #25 |
| QA1-U3 | ✅ Fixed | CP10 | Routine toggle is a plain blue dot — needs visual polish | Toggle now renders a sliding white dot with `box-shadow` affordance |

---

### Access / Routing Issues

| ID | Status | Checkpoint | Description | Fix |
|----|--------|-----------|-------------|-----|
| QA1-A1 | ✅ Fixed | CP8 | `/memory` redirects Members to `/query` | Added `/memory` to `MEMBER_NAV` in `permissions.ts`; edit actions already gated behind `isAdmin` |
| QA1-A2 | ✅ Fixed | CP12 | `POST /api/memory/propose` inaccessible to Members | Same root cause as A1 — resolved by A1 fix |

---

### Needs Retest / Uncertain

| ID | Status | Checkpoint | Description |
|----|--------|-----------|-------------|
| QA1-R1 | ⚠️ Needs retest | CP9 | Audit log entries for Invalidate, Edit, and Broaden — believed working but needs a direct DB query to confirm all three `action_type` values present |
| QA1-R2 | ⚠️ Needs retest | CP12 | Worker logs showed Gmail and Google Drive errors — B8 is now fixed; retest with worker running and check logs for remaining connector errors |

---

### Known Gaps

| ID | Status | Issue | AC Requirement | Decision |
|----|--------|-------|---------------|----------|
| QA1-G1 | 📝 Intentional | #11 | "Role stripped on deactivation" | `role_id` preserved for audit history — `is_active = false` is the signal. Documented in `deactivate/route.ts`. |
| QA1-G2 | ✅ Already done | #11 | Schedule changes take effect immediately | Restart note already present in `crons-tab.tsx` lines 109–111. |
| QA1-G3 | ⏳ Deferred | #12 | Filter by entity (client, project, person) | Not implemented — deferred to a future issue. |
| QA1-G4 | 📝 Accepted | #13 | Test run displays output inline | Output shown in run history via polling — acceptable UX for async jobs. |

---

### Outstanding items

Two items need attention in QA round 2:

- **QA1-R1** — run a DB query to confirm `audit_log` has `action_type` = `memory.invalidated`, `memory.edited`, and something for broaden after doing each mutation as an Owner
- **QA1-R2** — start the worker, run a routine, and check worker logs for any remaining Gmail / Drive connector errors now that the `utility_score` crash is fixed

Two items are deferred to future issues:

- **QA1-U1** — permission node selector (issue #23, blocked on planning #25)
- **QA1-U2** — visual cron builder (issue #24, blocked on planning #25)

---

## Pre-QA Notes

UI/UX improvements and non-issue fixes captured before QA round 1.

---

## Server component role lookups — use service role client

Server components (`page.tsx`, `layout.tsx`) must use `createSupabaseClient(URL, SERVICE_KEY)` for any `public.users` queries. The anon+session client (`createClient()`) does not propagate `auth.uid()` to PostgREST RLS in the App Router server context — queries return null rows. Auth checks (`getUser()`) still use the anon client. All `/api/` routes already follow this pattern. Fixed in issue #11 commit.

## Query Interface

- **History panel redesign** — currently shows a flat list of past query inputs only. Should work like Claude/ChatGPT: a sidebar of past conversations, each showing the full exchange (user query + brain response + provenance labels) when clicked. Data is already available in `agent_runs` — UI change only.
