# Sourcer: handoff for a new session

Read this before changing anything. It covers what the system is, how it runs,
the conventions it depends on, decisions already made with the owner, and
what's open. `README.md` covers setup steps for humans; this file covers
context for whoever works on the code next.

Last updated: 2026-10-05.

## What it is

Two tools for 1v1Me (a CoD wager platform; the owner works there), sharing one
Supabase Postgres database:

1. **Creator sourcing**: find competitive-gaming creators on Twitch and YouTube
   for Call of Duty, NBA 2K, EA FC, Madden, Counter-Strike, Tekken and Street Fighter.
2. **Competitor sponsor watch**: which creators Kalshi, Polymarket, Underdog,
   PrizePicks, DraftKings and FanDuel work with, their promo codes, and their
   Meta ads. 1v1Me itself is tracked as a baseline.

Original spec (Claude Doc): https://claude.ai/code/artifact/9b4624c6-8871-4a36-8097-3cfa0d8a35b4

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
- Jobs run in GitHub Actions. There is no server. The viewer runs only on the
  owner's computer (`npm run dev`, bound to 127.0.0.1).
- Repo: github.com/Cullen44/Sourcer (public). Working/default branch:
  `claude/brave-heisenberg-0ktvvq`.

## Layout

```
prisma/schema.prisma, prisma/migrations/   schema + hand-checked migrations
src/config/      games.ts (target titles, Twitch/YouTube matching), youtube.ts (quota
                 budgets, discovery filters), competitors.ts (brands, FB Page IDs, codes)
src/twitch/      client.ts (Helix, app token, rate-limit pacing), enrich.ts (profiles),
                 metrics.ts (daily followers/clips/labels)
src/poll.ts      one Twitch sweep;  src/rollup.ts  nightly rollup + 7-day retention
src/youtube/     client.ts (quota-aware), vetting.ts (metrics + filters), sync.ts,
                 discover.ts (search → vet → refresh), twitch-links.ts, usage.ts
src/sponsors/    codes.ts (brand/code matching), youtube-promo.ts, twitch-titles.ts
src/ads/         Meta Ad Library: collect.ts (Playwright), parse.ts, store.ts, group.ts
src/report/      changes.ts (weekly changes → Markdown)
src/lib/         viewer data: queries.ts, watchlist.ts, jobs.ts (Run now buttons), db.ts
src/app/         viewer pages: / (overview), creators, creators/[id], watchlist,
                 youtube (discovery), youtube/[channelId], sponsors, ads, changes
scripts/         entry points: poll, rollup, daily, collect-ads, seed-*, report, predev.mjs
test/            vitest; DB tests need TEST_DATABASE_URL
.github/workflows/  poll, nightly, ads, setup-db, ci, youtube-check
```

## How data flows

| Workflow | Schedule (UTC) | Does |
|---|---|---|
| `poll.yml` | :07/:27/:47 | Live streams per target Twitch category down to `VIEWER_FLOOR` (20), plus every creator seen on a target title in 30 days, in any category. Writes `poll_runs`, `stream_observations`, `creators`. ~35 s. |
| `nightly.yml` | 08:15 | `db:deploy` (migrations), `rollup` (→ `creator_daily`, deletes observations > 7 days), then `npm run daily`. ~15 min. |
| `ads.yml` | 10:37 | Playwright scrapes the Meta Ad Library for each FB Page. ~2 min. |
| `setup-db.yml` | manual | Migrations + seed games and competitors. |
| `ci.yml` | push | typecheck, migrate, tests, build. |

All scheduled workflows are gated on the repo variable `POLLER_ENABLED == 'true'`.

`npm run daily` stages (each isolated; one failing doesn't stop the others; the process exits 1 if any failed):
1. `twitch-enrich`: profiles for new creators.
2. `twitch-title-scan`: competitor names and codes in stream titles.
3. `twitch-metrics`: once per creator per day, for creators seen in 30 days.
   Followers (`/channels/followers` total, which works with an app token), clips
   in 30 days and their views (≤ 5 pages), content classification labels, and
   the branded-content flag. Snapshot in `creator_twitch_daily`. About 2.2 requests per creator.
4. YouTube stages, each capped to a share of the 10,000 units/day (ceiling 8,000; quota day
   = Pacific time; spend tracked in `youtube_usage`): twitch-links, promo-search,
   discovery-search, vetting, refresh (tracked channels, which also stores likes/comments
   → `engagement_rate`).

YouTube discovery is a funnel so it can't flood the DB: candidate → vetted →
tracked or rejected. The filters: at least 50% of recent uploads on target titles,
4+ uploads in 30 days, median views between 1k and 250k, at most 25 new channels a
day and 400 in total. Rejected channels are only re-vetted after 30 days.

Meta: only the first ~30 ads per Page are visible (pagination is rate-limited). The
collector reads Meta's "~N results" count; ads are marked stopped only when a run
was complete. Any Page problem fails the run, which makes GitHub email the owner.

## Conventions (things that break if ignored)

- **Commit as the repo owner.** `user.name "Cullen44"`,
  `user.email "273448091+Cullen44@users.noreply.github.com"`. GitHub only runs a
  scheduled workflow as whoever last changed it. Commits attributed to another
  account (this happened once with a "claude" account) silently stopped all schedules.
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
  buttons. It shows facts and no rankings (owner's choice; see below).
- `npm run dev` runs `scripts/predev.mjs` first: it regenerates the Prisma client
  and clears `.next` when the schema changed. Tell the owner to update with
  `git pull && npm ci && npm run dev`, using `npm ci` rather than `npm install`
  so the lockfile isn't rewritten and later pulls don't get blocked.
- `next dev` writes `AGENTS.md`/`CLAUDE.md` in the repo root. They're
  git-ignored on purpose; don't commit them.
- Commit trailer used so far:
  `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Environment

`.env` (git-ignored); see `.env.example`.
- `DATABASE_URL`: Supabase pooler, port 6543, `?pgbouncer=true`. The viewer only needs this.
- `DIRECT_URL`: port 5432, for migrations.
- `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`, `YOUTUBE_API_KEY`.
- `GITHUB_TOKEN` (optional, viewer only): fine-grained, this repo, Actions read/write;
  enables the Run now buttons. The owner hasn't created it yet.
- `VIEWER_FLOOR` (20), `POLL_INTERVAL_MINUTES` (20; must match the real poll
  cadence, because hours streamed cap each gap at 2× this).

The same values are GitHub Actions secrets. `POLLER_ENABLED` is a repo variable.

## Decisions made with the owner

- **No rankings in the viewer.** Scoring (spec phase 4) may exist in the
  pipeline and exports, but the viewer only browses and filters.
- **YouTube without the flood**: the discovery funnel above, not "all gaming creators".
- Creators page: All / Twitch / YouTube tabs; **every column filterable**.
  Twitch creators with a tracked YouTube channel are one merged row.
- **Meta: first 30 ads per brand** accepted, despite the rate limit. Identical ads
  are grouped ("×4 variants").
- **Watchlist**: ☆ save, notes, live status and week-over-week change.
- **1v1Me is tracked** like a competitor (FB Page 104528351230896); weak name
  ("1v1 me" is gamer talk), so it only counts next to promo language.
- **Audience metrics, 1 per creator per day**: Twitch followers (+7-day growth),
  clips in 30 days and their views, content labels, branded flag; YouTube engagement
  (median (likes+comments)/views).
- Repo is public (free Actions minutes). The owner may go private later; see "Scheduling".

## IDs

FB Pages: 1v1Me 104528351230896 · Kalshi 108107432370909 · Polymarket 101309195074880 ·
Underdog 100653998267239 · PrizePicks 2026200897655629 · DraftKings/FanDuel none yet.

## State as of 2026-10-05

- ~2,400 Twitch creators in the 30-day window; all have audience metrics.
- 25 tracked YouTube channels, 500+ candidates waiting (the 25/day cap makes the backlog drain slowly).
- ~220+ sponsor mentions. Meta: ~30 ads collected per brand; Meta reports
  ~360 (1v1Me), ~470 (Kalshi), ~45 (Polymarket), ~49 (Underdog), ~480 (PrizePicks).
- **GitHub's scheduler is unreliable**: 16 polls in ~3 days instead of ~216;
  Nightly started 9 hours late; Ads skipped a day. Fix: external cron (below).

## Scheduling: moving off GitHub's cron (owner's to-do)

1. Create a fine-grained GitHub token (repo: Sourcer only; permission Actions → Read
   and write). Reuse it as `GITHUB_TOKEN` in `.env` for the Run now buttons.
2. At cron-job.org, create one job per workflow:
   - URL `https://api.github.com/repos/Cullen44/Sourcer/actions/workflows/<file>/dispatches`
   - Method POST. Headers: `Authorization: Bearer <token>`,
     `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`,
     `Content-Type: application/json`
   - Body `{"ref":"claude/brave-heisenberg-0ktvvq"}`. Success is HTTP 204.
   - `poll.yml` every 20 min (minutes 7,27,47); `nightly.yml` daily 08:15 UTC;
     `ads.yml` daily 10:37 UTC.
3. Once runs show up as `workflow_dispatch` in Actions, delete the `schedule:`
   blocks from the three workflows (keep `workflow_dispatch`) so runs don't double.
   Commit as Cullen44.
4. If the repo goes private (2,000 free minutes/month; each run bills whole minutes):
   polling every 20 min ≈ 2,160 min/month for polls alone, which is over. Every 30 min
   (≈1,440 + nightly ~450 + ads ~90 ≈ 1,980) is borderline; **hourly** (≈720 + 540)
   is safe. Whatever cadence is chosen, set `POLL_INTERVAL_MINUTES` to match
   (nightly.yml env and `.env`). The owner hasn't chosen yet.

## Open items / offered, not built

- Store Twitch `broadcaster_language` from `/channels` (already fetched in
  `twitch/metrics.ts`) so the language filter works for creators who didn't stream in
  the last 7 days, and show names instead of codes. Offered; awaiting a yes.
- Kick support (official API: live streams by category, channel profiles; probably no
  followers or clips). Needs a Kick dev app → `KICK_CLIENT_ID`/`SECRET`. Needs a platform
  column on creators. Offered; awaiting a yes.
- Daily history of the Twitch branded-content flag. Offered.
- Compact label display on Creators rows (4 labels stack tall); maybe hide
  "Mature game" (auto-applied to every CoD/CS stream). Offered.
- Promo-code quality gate: only search a newly seen code after 2+ sightings (the first
  promo search added ~86 codes, some likely junk; the owner hasn't reviewed them).
- Twitch bio → YouTube links found 0 of 773 so far; worth a look at `extractYoutubeRef`.
- Label 1v1Me as the home brand on the Sponsors page.
- Spec phase 4: scoring + CSV/Markdown export for Claude review (needs ~1 week of data).

## Local verification

```sh
npm ci
npm run typecheck
TEST_DATABASE_URL=postgresql://…/sourcer_test npm test   # separate, disposable DB
npm run dev                                               # viewer at 127.0.0.1:3000
```
Don't run `npm run poll`/`daily`/`ads` locally against the production DB unless the
owner asks: they spend Twitch/YouTube quota and write real data. Trigger the GitHub
workflow instead.
