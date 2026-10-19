# Sourcer: handoff for a new session

Read this before changing anything. It covers what the system is, how it runs,
the conventions it depends on, decisions already made with the owner, and
what's open. `README.md` covers setup steps for humans; this file covers
context for whoever works on the code next.

Last updated: 2026-10-19.

## What it is

Creator sourcing and competitor watch for **Boba Charge** (bobacharge.com): a
Buffalo-area startup selling residential-style EV chargers with built-in QR-code
payment, aimed at short-term-rental hosts (guests scan, pay, charge; hosts set
pricing in a free owner app; ~$600). Two tools share one Supabase Postgres DB:

1. **Creator sourcing** (YouTube only): channels whose uploads are about
   hosting short-term rentals (Airbnb, VRBO, co-hosting). Covering or owning
   EVs is the preferred extra, measured as `ev_share`, but it isn't required.
2. **Competitor watch**: YouTube videos mentioning ChargePoint (Airbnb's
   official charger partner for hosts) or EVmatch (peer-to-peer charger
   sharing), with Boba Charge itself as a baseline; promo codes; Meta ads.

**History:** until 2026-10-19 this repo sourced competitive-gaming creators on
Twitch and YouTube for 1v1Me and watched Kalshi/Polymarket/PrizePicks/etc. The
owner pivoted it. Migration `20261019000000_bobacharge_pivot` dropped every
Twitch table and **wiped all sourcing, sponsor and ad data, at the owner's
request, with no backup**. Twitch code was removed. Git history has it if ever needed.

The pipeline is deterministic (fetch, store, aggregate). Judgment happens in
Claude conversations, not in code.

## Stack

- TypeScript, Node 22, `tsx` for scripts, `vitest` for tests.
- Prisma 7.10 with the `prisma-client` generator → `src/generated/prisma`
  (git-ignored, regenerated on `npm ci`/`npm run dev`). Uses `@prisma/adapter-pg`.
  `prisma.config.ts` reads `DIRECT_URL`/`DATABASE_URL`.
- Next.js 16.3 viewer (App Router, server components, server actions). This
  Next version differs from older training data; check
  `node_modules/next/dist/docs/` when unsure.
- Jobs run in GitHub Actions, started by Supabase pg_cron. There is no server. The
  viewer runs only on the owner's computer (`npm run dev`, bound to 127.0.0.1).
- Repo: github.com/Cullen44/Sourcer (public). Working/default branch:
  `claude/brave-heisenberg-0ktvvq`.

## Layout

```
prisma/schema.prisma, prisma/migrations/   schema + hand-checked migrations
src/config/      topics.ts (STR + EV patterns, discovery queries), youtube.ts (quota
                 budgets, discovery filters), competitors.ts (brands, FB Page IDs,
                 domains, codes, mention search queries)
src/youtube/     client.ts (quota-aware), vetting.ts (metrics + filters), sync.ts,
                 discover.ts (search → vet → refresh), usage.ts
src/sponsors/    codes.ts (brand/code matching), youtube-promo.ts (competitor search)
src/ads/         Meta Ad Library: collect.ts (Playwright), parse.ts, store.ts, group.ts
src/report/      changes.ts (weekly changes → Markdown)
src/lib/         viewer data: queries.ts, watchlist.ts, jobs.ts (Run now buttons), db.ts
src/app/         viewer pages: / (overview), creators, watchlist, youtube (discovery),
                 youtube/[channelId], sponsors, ads, changes
scripts/         entry points: daily, collect-ads, seed-competitors, report, predev.mjs
supabase/        scheduler.sql (pg_cron → workflow_dispatch; run by hand in Supabase)
test/            vitest; DB tests need TEST_DATABASE_URL
.github/workflows/  nightly, ads, setup-db, ci, youtube-check
```

## How data flows

| Workflow | Schedule (UTC) | Does |
|---|---|---|
| `nightly.yml` | 08:15 | `db:deploy`, `competitors:seed` (config → DB), `npm run daily`. |
| `ads.yml` | 10:37 | `db:deploy`, `competitors:seed`, then Meta Ad Library, first ~30 ads per FB Page. |
| `setup-db.yml` | manual | Migrations + competitor seed (fresh DB only). |
| `ci.yml` | push | typecheck, migrate, tests, build. |

Supabase pg_cron dispatches nightly and ads on time (`supabase/scheduler.sql`);
the `schedule:` blocks in the workflows are a backup. All gated on repo variable
`POLLER_ENABLED == 'true'`.

`npm run daily`: YouTube stages, each capped to a share of the 10,000 units/day
(ceiling 8,000; quota day = Pacific; spend in `youtube_usage`), isolated so one
failing doesn't stop the rest (exit 1 if any failed):
1. `youtube-promo-search`: each competitor's `searchQueries` (config), then known
   codes oldest-searched first. Mentions → `sponsor_mentions`; new codes →
   `promo_codes`; channels → candidates (source `sponsor`).
2. `youtube-discovery-search`: one search per `DISCOVERY_QUERIES` entry (12 × 100 units),
   US/English, last 14 days. Channels → candidates (source `discovery`).
3. `youtube-vetting`: candidate → tracked/rejected. Filters (`DISCOVERY`):
   `str_share` ≥ 30%, ≥ 2 uploads in 30 days, median views 300–250k; ≤ 25 new a
   day, ≤ 400 total; rejected re-vetted only if seen again after 30 days.
4. `youtube-refresh`: tracked channels once a day: uploads, likes/comments →
   `engagement_rate`, `str_share`, `ev_share`, daily snapshot.

Topic matching (`config/topics.ts`): STR on **title + tags only** (descriptions
carry "book my Airbnb" boilerplate); EV on **title + tags + description** (gear
lists and "my Tesla" are real EV signals). Videos store `topics` (`STR`, `EV`).

Brand matching (`sponsors/codes.ts`): name, domain and aliases ("bobacharge",
"ev match") always count; "charge point" (generic phrase) only next to promo
language.

## Conventions (things that break if ignored)

- **Commit as the repo owner.** `user.name "Cullen44"`,
  `user.email "273448091+Cullen44@users.noreply.github.com"`. GitHub only runs a
  scheduled workflow as whoever last changed it.
- **No `.js` extensions in imports.** Turbopack (viewer) and tsx (scripts) both
  resolve extensionless paths; `.js` breaks Turbopack.
- **Migrations**: never `prisma migrate reset` or `migrate dev` against a real DB.
  Generate SQL with
  `npx prisma migrate diff --from-schema <old schema file> --to-schema prisma/schema.prisma --script`
  (old schema via `git show HEAD:prisma/schema.prisma`), save it as
  `prisma/migrations/<timestamp>_<name>/migration.sql`, review it, and apply with
  `npx prisma migrate deploy`. Production applies it in the next Nightly.
- **RLS**: every table has row-level security on with no policies, which blocks
  Supabase's public Data API. The pipeline connects as the owner, which bypasses
  RLS. **Add `ALTER TABLE "<new>" ENABLE ROW LEVEL SECURITY;` to any migration
  that creates a table.**
- **Tests** use a separate database (`TEST_DATABASE_URL`, e.g. `sourcer_test`). DB
  tests TRUNCATE tables, so never point them at real data.
- **Viewer is read-only** except the watchlist (`saved_creators`) and the Run now
  buttons. It shows facts and no rankings (owner's choice).
- `npm run dev` runs `scripts/predev.mjs` first (regenerates the Prisma client,
  clears `.next` on schema change). The owner updates with
  `git pull && npm ci && npm run dev`.
- `next dev`/`next build` write `AGENTS.md`/`CLAUDE.md` in the repo root and may
  touch `next-env.d.ts`. Root copies are git-ignored; restore `next-env.d.ts`
  before committing.
- Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Environment

`.env` (git-ignored); see `.env.example`.
- `DATABASE_URL`: Supabase pooler, port 6543, `?pgbouncer=true`. The viewer only needs this.
- `DIRECT_URL`: port 5432, for migrations.
- `YOUTUBE_API_KEY`.
- `GITHUB_TOKEN` (optional, viewer only): the same fine-grained token as the scheduler.

The same values are GitHub Actions secrets. `POLLER_ENABLED` is a repo variable.
The old `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` secrets are unused and can be deleted.

## Decisions made with the owner

- **YouTube only.** Instagram/TikTok have no public discovery API; the owner
  chose YouTube only over adding IG/TikTok by hand.
- **Targets**: STR/Airbnb host creators; EV coverage or ownership preferred,
  not required. The Creators page sorts EV coverage first and has All / Cover EVs /
  No EV content tabs.
- **Competitors**: ChargePoint and EVmatch (owner's picks), plus Boba Charge
  itself. Others the owner didn't pick: Tesla Wall Connector, Wallbox.
- **Old data cleared, no backup** (owner's explicit choice).
- **No rankings in the viewer**; every column filterable.
- **Meta: first ~30 ads per Page** (pagination is rate-limited); identical ads grouped.
- **Scheduling via Supabase pg_cron**, repo stays public (free Actions minutes).

## State as of 2026-10-19 (end of day)

- **Pivot is live.** Nightly ran by hand at 16:17 UTC: the pivot migration wiped the
  old data, competitors were seeded, and the first run did:
  - competitor search: 4 searches, 39 mentions, 1 new code;
  - discovery: 12 searches, 313 candidates;
  - vetting: 22 admitted (of 25/day), 314 rejected;
  - YouTube units that day: 5,419 (including the earlier scheduled run).
- **Meta ads working** for all three Pages (FB Page IDs: Boba Charge
  1148994618304224 · ChargePoint 59788879399 · EVmatch 1599619566964007). Results:
  Boba Charge 6 ads, ChargePoint 4, both complete. EVmatch runs no ads; the
  collector reads Meta's "no ads" message as 0 (a clean, complete run, not a
  failure). If a Page ever shows neither ads nor a count, the log quotes the page's
  wording so `reportedResultCount` in `src/ads/parse.ts` can be extended.
- `ads.yml` seeds competitors itself, so Page IDs added to config are collected
  on its next run without waiting for Nightly.
- **Owner's to-do:** run `select cron.unschedule('sourcer-poll');` in Supabase. The
  retired poll job keeps dispatching the deleted `poll.yml` (harmless 404s) until then.
  Re-running `supabase/scheduler.sql` does the same.
- The owner runs the viewer on Windows from `C:\Users\Cullw\Sourcer`
  (PowerShell; `git pull`, `npm ci`, `npm run dev`).
- Discovery thresholds are first guesses for a smaller niche than gaming; tune after
  a week (look at rejected reasons on the Discovery page). Most of the first 314
  rejections were off-topic.

## Open items / ideas, not built

- Referral vs paid tagging of mentions (YouTube `paidProductPlacementDetails`
  flag, "#ad"/"sponsored" language) was proposed before the pivot. It may matter
  less for chargers, which rarely have referral codes.
- Possibly more competitors (Tesla Wall Connector, Wallbox, Emporia) if the owner asks.
- Scoring + CSV/Markdown export for Claude review (needs ~1 week of data).

## Local verification

```sh
npm ci
npm run typecheck
TEST_DATABASE_URL=postgresql://…/sourcer_test npm test   # separate, disposable DB
npm run dev                                               # viewer at 127.0.0.1:3000
```
Don't run `npm run daily`/`ads` locally against the production DB unless the
owner asks: they spend YouTube quota and write real data. Trigger the GitHub
workflow instead.
