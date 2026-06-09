# Fix Backlog

---

## QA1 — Issues found during QA round 1 (2026-06-08)

**Status: fixed 2026-06-09** — all B and A items resolved; U1/U2 deferred to issues #23/#24 (planning in #25); G1 documented as intentional.

These items were discovered while working through `QA_CHECKPOINTS.md` against issues #11, #12, and #13.

---

### Bugs

| ID | Checkpoint | Severity | Description |
|----|-----------|----------|-------------|
| QA1-B1 | CP3 | High | Deactivate user uses browser `confirm()` — needs an in-app modal |
| QA1-B2 | CP3 | High | No way to reactivate a deactivated user — add a "Reactivate" action |
| QA1-B3 | CP4 | Medium | RTBF "Invalidate selected" button stays bright red when nothing is selected — should appear visually disabled |
| QA1-B4 | CP5 | High | Delete role uses browser `confirm()` — needs in-app modal (same global pattern fix as QA1-B1) |
| QA1-B5 | CP7 | High | Source filter throws 500 — `operator does not exist: jsonb ~~* unknown` on `GET /api/memory?source=gmail` and `?source=google_drive` |
| QA1-B6 | CP7 | Low | Date range filter has no reset button — user must clear both fields manually |
| QA1-B7 | CP9 | High | Memory "Invalidate" in Inspector uses browser `confirm()` — same global fix as QA1-B1 |
| QA1-B8 | CP11 | High | Worker crashes when writing a memory: `null value in column "utility_score" of relation "memories" violates not-null constraint` |
| QA1-B9 | CP11 | High | Delete routine only works on already-deactivated routines — deleting an active routine silently fails; deactivating then trying to delete also fails |
| QA1-B10 | CP11 | Low | "Run now" button stays fully vibrant when routine is disabled — should be visually greyed out |

---

### Polish / UX Improvements

| ID | Checkpoint | Description |
|----|-----------|-------------|
| QA1-U1 | CP5 | Permission node editor needs a predefined selector with names and descriptions — raw key/value input is not user-friendly |
| QA1-U2 | CP10 | Custom cron expression field is not accessible to non-technical users — needs a visual schedule builder (e.g. "Every Monday at 9am") |
| QA1-U3 | CP10 | Routine enable/disable toggle is a plain blue dot — needs visual polish |

---

### Access / Routing Issues

| ID | Checkpoint | Description |
|----|-----------|-------------|
| QA1-A1 | CP8 | `/memory` redirects Members to `/query` — Members cannot reach the Memory Inspector at all, so member-clearance security checks (CP8 items 3 and 5) could not be fully tested |
| QA1-A2 | CP12 | `POST /api/memory/propose` is inaccessible to Members because `/memory` is blocked — same root cause as QA1-A1 |

---

### Needs Retest / Uncertain

| ID | Checkpoint | Description |
|----|-----------|-------------|
| QA1-R1 | CP9 | Audit log entries for Invalidate, Edit, and Broaden mutations — believed working but needs a direct DB query to confirm all three action types are present |
| QA1-R2 | CP12 | Worker logs show Gmail and Google Drive errors — capture and triage after QA1-B8 is fixed |

---

### Known Gaps (from code review — pre-QA)

These diverge from the issue acceptance criteria and need a decision: fix before shipping, accept as-is, or defer.

| ID | Issue | AC Requirement | Current State | Options |
|----|-------|---------------|---------------|---------|
| QA1-G1 | #11 | "Role stripped on deactivation" | `role_id` is NOT cleared on deactivate — only `is_active = false` is set | Intentional (preserve history) or missing step? Decide and document |
| QA1-G2 | #11 | Cron schedule changes take effect immediately | Worker reads `system_config` at startup — restart required for new schedule to apply | Add a note in the Crons UI warning that schedule changes require a worker restart |
| QA1-G3 | #12 | Filter memories by entity (client, project, person) | Not implemented in UI or API | Implement or defer to a future issue |
| QA1-G4 | #13 | Test run displays output | Output shown in run history via polling, not inline in a modal | Acceptable for async jobs — document expected UX in product notes |

---

### Fix priority order (suggested)

1. **QA1-B8** — worker crash on `utility_score` blocks all routine execution
2. **QA1-B5** — source filter 500 breaks a core Memory Inspector filter
3. **QA1-B9** — delete routine flow broken for active routines
4. **QA1-B1 / QA1-B4 / QA1-B7** — global: replace all browser `confirm()` dialogs with in-app modals
5. **QA1-B2** — reactivate user flow
6. **QA1-B3 / QA1-B10** — disabled-state visual polish
7. **QA1-B6** — date range reset
8. **QA1-U1 / QA1-U2 / QA1-U3** — UX improvements
9. **QA1-G1–G4** — gap decisions

---

## Pre-QA Notes

UI/UX improvements and non-issue fixes captured before QA round 1.

---

## Server component role lookups — use service role client

Server components (`page.tsx`, `layout.tsx`) must use `createSupabaseClient(URL, SERVICE_KEY)` for any `public.users` queries. The anon+session client (`createClient()`) does not propagate `auth.uid()` to PostgREST RLS in the App Router server context — queries return null rows. Auth checks (`getUser()`) still use the anon client. All `/api/` routes already follow this pattern. Fixed in issue #11 commit.

## Query Interface

- **History panel redesign** — currently shows a flat list of past query inputs only. Should work like Claude/ChatGPT: a sidebar of past conversations, each showing the full exchange (user query + brain response + provenance labels) when clicked. Data is already available in `agent_runs` — UI change only.
