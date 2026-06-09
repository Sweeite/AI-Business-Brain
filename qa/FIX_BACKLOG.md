# Fix Backlog

---

## QA Round 1 — 2026-06-08

Issues found while running Checkpoints 1–12 against issues #11, #12, #13. **All B and A items fixed 2026-06-09. U3 fixed. U1/U2 deferred.**

### Bugs

| ID | CP | Severity | Description | Fix |
|----|----|----------|-------------|-----|
| QA1-B1 | CP3 | High | Deactivate user uses browser `confirm()` | Shared `ConfirmModal` component wired into `users-tab.tsx` |
| QA1-B2 | CP3 | High | No way to reactivate a deactivated user | New `POST /api/admin/users/[id]/reactivate` route + Reactivate button in Users tab |
| QA1-B3 | CP4 | Medium | RTBF Invalidate button stays bright red when nothing is selected | `opacity: 0.45 / cursor: not-allowed` when selection is empty |
| QA1-B4 | CP5 | High | Delete role uses browser `confirm()` | `ConfirmModal` wired into `roles-tab.tsx` |
| QA1-B5 | CP7 | High | Source filter throws 500 — `jsonb ~~* unknown` error | Changed to `.contains('source_refs', { connector: source })` — correct key + `@>` operator |
| QA1-B6 | CP7 | Low | Date range filter has no reset button | × clear button shown when either date field has a value |
| QA1-B7 | CP9 | High | Memory Invalidate uses browser `confirm()` / `alert()` | `ConfirmModal` wired into `memory-inspector-client.tsx`; errors routed to `setError` |
| QA1-B8 | CP11 | High | Worker crashes writing memory — `utility_score NOT NULL` constraint | Migration `20260612000001` drops erroneous NOT NULL on `memories.utility_score` |
| QA1-B9 | CP11 | High | Delete routine silently fails for routines with run history | Migration `20260612000002` changes FK to `ON DELETE SET NULL`; client shows error banner on failure |
| QA1-B10 | CP11 | Low | Run now button stays fully opaque when routine is disabled | `opacity: 0.45` applied when `!r.is_active` |

All ✅ Fixed 2026-06-09.

---

### Access Issues

| ID | CP | Description | Fix |
|----|----|-------------|-----|
| QA1-A1 | CP8 | `/memory` redirected Members to `/query` | Added `/memory` to `MEMBER_NAV` in `permissions.ts`; edit actions already gated behind `isAdmin` |
| QA1-A2 | CP12 | `POST /api/memory/propose` inaccessible to Members | Same root cause as A1 — resolved by A1 fix |

All ✅ Fixed 2026-06-09.

---

### UX Improvements

| ID | CP | Description | Fix |
|----|----|-------------|-----|
| QA1-U1 | CP5 | Permission node editor needs a predefined selector with names and descriptions | ⏳ Deferred — issue #23, blocked on planning issue #25 |
| QA1-U2 | CP10 | Custom cron expression needs a visual schedule builder | ⏳ Deferred — issue #24, blocked on planning issue #25 |
| QA1-U3 | CP10 | Routine toggle is a plain blue dot — needs visual affordance | ✅ Fixed — toggle now renders a sliding white dot with border and box-shadow |

---

### Known Gaps

| ID | Issue | AC Requirement | Decision |
|----|-------|----------------|----------|
| QA1-G1 | #11 | "Role stripped on deactivation" | Intentional — `role_id` preserved for audit history; `is_active = false` is the signal. Documented in `deactivate/route.ts`. |
| QA1-G2 | #11 | Schedule changes take effect immediately | Restart required — note already surfaced in `crons-tab.tsx`. Accepted. |
| QA1-G3 | #12 | Filter by entity (client, project, person) | Not implemented — deferred to a future issue. |
| QA1-G4 | #13 | Test run displays output inline | Output shown in run history via polling. Acceptable UX for async jobs. |

---

## QA Round 2 — 2026-06-09

Bugs found during the QA1 fix verification pass (Checkpoints 13–22). **All fixed 2026-06-09.**

| ID | Description | Root Cause | Fix |
|----|-------------|------------|-----|
| QA2-B1 | Audit log inserts silently failing for all three memory mutation routes | `actor_type: 'human'` violates the `audit_log` check constraint — only `'user'`, `'system'`, `'agent'` are valid | Changed to `actor_type: 'user'` in `invalidate/route.ts`, `edit/route.ts`, and `broaden/route.ts` |
| QA2-B2 | Edit route inserted new memory with `utility_score: 0` instead of `null` | Latent B8 variant in `edit/route.ts` — hardcoded `0` would skew decay scoring | Changed to `utility_score: null`; regenerated `database.types.ts` to reflect B8 migration |

Also confirmed in QA2:
- **QA1-R1** (audit log) — all three memory mutation audit entries verified in CP20 after QA2-B1 fix
- **QA1-R2** (worker connector errors) — worker logs clean after B8 fix (CP21); Gmail/Drive 401s are expected for unconnected accounts

---

## Deferred Items

| ID | Description | Issue |
|----|-------------|-------|
| QA1-U1 | Predefined permission node selector in Roles tab | #23 (planning: #25) |
| QA1-U2 | Visual cron schedule builder in Routine Wizard | #24 (planning: #25) |
| QA1-G3 | Entity filter (client, project, person) in Memory Inspector | Future issue |
