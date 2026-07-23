# InboxPilot

An AI email operations agent for busy client-facing professionals. InboxPilot triages your inbox, summarizes threads, drafts replies, extracts tasks and calendar events, and automates follow-ups via policies — while keeping every action reversible and requiring your approval before anything external happens (sending mail, archiving, labeling, snoozing, creating calendar events).

## Stack

- **Next.js 15** (App Router, TypeScript) + Tailwind CSS
- **Auth.js (NextAuth v5)** with Google and Microsoft Entra ID OAuth, plus a built-in demo sign-in
- **Prisma + Postgres** for persistence (Vercel Postgres/Neon/Supabase/local Postgres all work — see below)
- **Anthropic Claude API** for triage/summarization/drafting, with a deterministic rule-based fallback when no API key is set
- **Gmail API** and **Microsoft Graph** provider adapters, behind a single provider-agnostic interface, plus a "mock" provider backed by seeded local data

## Architecture

- `lib/providers/` — `EmailProvider`/`CalendarProvider` interfaces implemented by `gmail.ts`, `outlook.ts`, and `mock.ts` (used for any account with no live OAuth connection).
- `lib/llm/` — `claude.ts` (real Claude calls) and `stub.ts` (rule-based fallback) behind one `LLMService` interface, selected automatically based on whether `ANTHROPIC_API_KEY` is set.
- `lib/plans.ts` — the safety core. Every AI-proposed action (send email, save draft, archive, label, snooze, create task, create calendar event) is a `PlanAction` inside a `Plan`. Nothing executes until the user approves it in the UI; reversible actions capture a `previousState` snapshot so they can be undone.
- `lib/policies.ts` — evaluates user-defined follow-up policies (`no_reply`, `schedule`, `label_added`, `before_meeting`) and turns matches into a `Plan` for review — policies never send mail directly.
- `app/api/**` — REST route handlers for sync, thread summarize/draft/extract, plans (create/approve/execute/undo), policies (CRUD/run), tasks, events, and memory.
- `app/**` + `components/**` — Dashboard ("Today" triage list + pending plans), thread detail (summary, messages, draft composer, extraction), Policies, Tasks & Calendar, and Settings pages.

## Getting started

You need a Postgres database first — a local instance, or a free one from Vercel Postgres/Neon/Supabase.

```bash
npm install
cp .env.example .env        # set DATABASE_URL to your Postgres instance; demo login works with no other config
npx prisma migrate dev      # applies the schema
npm run db:seed             # seeds a demo user + 8 sample email threads
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Continue as Demo Account**, then **Sync inbox** to triage the seeded threads. Beyond the database, this works with zero external credentials — no Google/Microsoft OAuth app and no Anthropic API key required — because:

- The demo account's mailbox uses the **mock** email/calendar provider, which reads/writes the seeded `EmailThread`/`EmailMessage` rows directly instead of calling a real API.
- Without `ANTHROPIC_API_KEY` set, triage/summarization/drafting/extraction fall back to `lib/llm/stub.ts`, a deterministic rule-based implementation. The dashboard shows a "rule-based (no API key)" badge in this mode.

### Deploying to Vercel

1. Add a Postgres database from the Vercel dashboard's **Storage** tab (or connect an existing Neon/Supabase instance) — this sets `DATABASE_URL` automatically.
2. Set `AUTH_SECRET` (`npx auth secret` to generate one) in the project's environment variables. Without it, sign-in fails with Auth.js's generic "There was a problem with the server configuration" error.
3. Deploy. `npm run build` runs `prisma generate && prisma migrate deploy && next build`, so the schema is applied automatically on every deploy.
4. Sign in with **Continue as Demo Account** to confirm it's working, then run `npm run db:seed` locally against the production `DATABASE_URL` if you want the demo data there too.

`auth.ts` sets `trustHost: true`, which is required for Auth.js to work behind Vercel's (or any) reverse proxy — omitting it produces the same generic "server configuration" error regardless of how the database is set up.

### Connecting real accounts

Fill in `.env` (see `.env.example` for exact scopes/permissions needed):

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — enables "Continue with Google" and Gmail/Google Calendar sync.
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID` — enables "Continue with Microsoft" and Outlook Mail/Calendar via Graph.
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` — switches triage/drafting from the rule-based stub to Claude.
- `CRON_SECRET` — bearer secret required by `POST /api/cron/policies`, meant to be hit by an external scheduler (Vercel Cron, GitHub Actions, etc.) to evaluate all users' policies on an interval.

> Gmail API, Microsoft Graph, and live Claude calls are implemented but not exercised end-to-end in this build's own testing (no live credentials were available). The full app — auth, Postgres, sync, drafting, plan approve/execute/undo, and policies — was verified end-to-end in-browser against the stub LLM/mock-provider path, including a production build (`next build && next start`) against a real Postgres instance. Connect real credentials and smoke-test sync + send/draft/archive before relying on those specific integrations in production.

## Safety model

- Nothing is ever sent, archived, labeled, snoozed, or added to a calendar without going through a `Plan` that the user explicitly approves in the UI.
- Every plan shows a human-readable summary **and** the raw structured `PLAN_JSON` for transparency.
- Reversible actions (drafts, archive, label, snooze, task/event creation) can be undone individually or all at once; sent emails are the one action marked non-undoable, and always require approval regardless of any policy.
- Policies only ever produce a `Plan` for review — they never send email autonomously.
