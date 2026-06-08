# Fix Backlog

UI/UX improvements and non-issue fixes to address after the main build is complete.

---

## Server component role lookups — use service role client

Server components (`page.tsx`, `layout.tsx`) must use `createSupabaseClient(URL, SERVICE_KEY)` for any `public.users` queries. The anon+session client (`createClient()`) does not propagate `auth.uid()` to PostgREST RLS in the App Router server context — queries return null rows. Auth checks (`getUser()`) still use the anon client. All `/api/` routes already follow this pattern. Fixed in issue #11 commit.

## Query Interface

- **History panel redesign** — currently shows a flat list of past query inputs only. Should work like Claude/ChatGPT: a sidebar of past conversations, each showing the full exchange (user query + brain response + provenance labels) when clicked. Data is already available in `agent_runs` — UI change only.
