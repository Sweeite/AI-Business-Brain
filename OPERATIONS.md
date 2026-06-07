# AI Business Brain — Operations & Production Considerations

> Living document. Add here whenever a non-obvious production decision, client conversation, or operational trade-off comes up during development. These are things that don't belong in the PRD (spec) or CONTEXT.md (architecture decisions) — they're things you need to know when actually deploying to a client or explaining the system to them.

---

## Email Scanning — Cost, Scope, and the Client Conversation

### The numbers (30-person business)

| Lookback | Emails (30 people) | Gate 3 Haiku cost | Voyage AI cost | Total (one-time) |
|---|---|---|---|---|
| 90 days | ~78,000 | ~$50 | ~$0.30 | ~$50 |
| 12 months | ~312,000 | ~$200 | ~$1.20 | ~$200 |
| 5 years | ~1.5M | ~$1,000 | ~$6 | ~$1,000 |

- The cost driver is the **Gate 3 Haiku classification call** (runs on every email), not Voyage AI embeddings (which are nearly free).
- The pre-filter drops ~40–60% of emails before Gate 3 runs (newsletters, no-reply senders, calendar invites, auto-replies) — estimates above assume this is already applied.
- **Ongoing cost** (incremental sync via webhook, new emails only) is negligible — a few dollars a month per client.
- Initial sync is a **one-time cost** per client per connector.

### The conversation to have with each client at onboarding

> "How far back do you want to scan your email history? 12 months is the default — covers your active knowledge and costs around $200 one-time. 90 days is faster and cheaper (~$50). If you want 5 years of full history, that's around $1,000 one-time and takes a day or two to process. We can always go back further later if you want."

### How to configure it

`initial_sync_lookback_days` in `system_config` controls the window. Since each client has their own Supabase project, this is already per-client — just update the row before the client connects Gmail or Drive:

```sql
UPDATE system_config SET value = '365' WHERE key = 'initial_sync_lookback_days';
```

Set to `0` to disable the limit and sync all history (expensive — confirm with client first).

---

## Google Drive — Don't Embed, Fetch Live

Drive files are already in a system of record with their own search API. The `search_drive` and `fetch_drive_file` tools handle live retrieval when the agent needs Drive content. Embedding Drive files into pgvector would duplicate data that already lives in Drive and add Voyage AI cost for no meaningful gain.

**What the Drive connector does capture:** the `memory` outcome from Gate 3 only — decisions, SOPs, or preferences extracted from documents and stored as durable memories. Everything else is left in Drive and fetched live via tools.

**How the agent knows to query Drive:** Claude decides based on the tool descriptions in the DB. If a user asks "what's in the Acme proposal?", Claude sees it has `search_drive` available, calls it, gets live results back, and answers with a "This is live" provenance label. No embedding needed.

**Implementation detail:** `drive-sync.ts` passes `skipIndexInPlace: true` to `runRoutingPipeline`. Do not remove this — it's what prevents Drive content from being written to the `chunks` table.

---

## Voyage AI — Rate Limits and Billing

- **Free tier:** 3 RPM, 10K TPM. Initial sync is very slow (20s+ waits between embedding calls). Fine for dev/testing, not for a real client onboarding.
- **Paid tier:** Rate limits increase significantly. The retry logic in `generateEmbedding()` becomes a no-op safety net and sync runs at normal speed.
- **Action:** Add a payment method at [dashboard.voyageai.com](https://dashboard.voyageai.com) → Billing before onboarding any real client.
- The embedding cost itself is negligible ($0.06/1M tokens). You're paying for the rate limit increase, not for the tokens.

---

## Google Drive Webhook — Setup Required Per Deployment

The Drive webhook (`POST /api/webhooks/drive`) verifies incoming notifications against `drive_webhook_channel_token` in `system_config`. This is seeded as `"REPLACE_WITH_SECRET"` and **must be set before any client connects Drive**.

```sql
UPDATE system_config
SET value = to_jsonb('your-strong-random-secret'::text)
WHERE key = 'drive_webhook_channel_token';
```

Generate a secret with: `openssl rand -hex 32`

The webhook also requires a **publicly reachable URL** — works on Railway in production, not on localhost without a tunnel (ngrok etc.). The OAuth connect + initial file sync work fine on localhost; only real-time Drive change notifications need the public URL.

---

## Google Cloud Console — APIs to Enable Per Deployment

Each client deployment uses the agency's Google OAuth client (or the client's own). Make sure these APIs are enabled in the relevant Google Cloud project:

| API | Required for |
|---|---|
| Gmail API | Gmail connector (OAuth + sync + push notifications) |
| Google Drive API | Drive connector (OAuth + sync + webhooks) |

Enable at: `https://console.developers.google.com/apis/dashboard?project=<project-id>`

Also add the correct redirect URIs to the OAuth client:
- `https://<railway-app-url>/api/connectors/gmail/callback`
- `https://<railway-app-url>/api/connectors/drive/callback`

---
