# Sourcer

Two tools sharing one Postgres database:

- **Creator sourcing**: ranks competitive-gaming creators (Call of Duty, NBA 2K, EA FC, Madden, Counter-Strike, Tekken, Street Fighter) on relevance, trajectory, consistency, scale and sponsor density. It is deliberately not a follower leaderboard.
- **Sponsor watch**: tracks which creators Kalshi, Polymarket, Underdog, PrizePicks, DraftKings and FanDuel are working with, what creative they run, which promo codes are live, and what changed week over week.

The pipeline does deterministic work only (fetch, store, aggregate, score). Judging fit happens in a Claude conversation over the exported Markdown.

## Status

| Phase | What | State |
|---|---|---|
| 0 | Schema, migrations, CI | Done |
| 1 | Twitch poller + nightly rollup/retention | Live |
| 2 | Sponsor watch: YouTube promo-code search, Twitch title scan, Meta Ad Library (first ~30 ads per advertiser), weekly changes | Done |
| 3 | Twitch profiles, YouTube links from Twitch bios, YouTube discovery | Done |
| 4 | Scoring + CSV/Markdown export | Needs ~1 week of data |
| 5 | Local viewer (browse, filter, watchlist; no rankings) | Done |

## How it runs

GitHub Actions, no server:

- `poll.yml`, every 20 min: live streams on each target game down to `VIEWER_FLOOR`, plus every tracked creator's live stream in *any* category. Without that second sweep, relevance (share of streaming on target titles) can't be computed.
- `nightly.yml`, 08:15 UTC (after the YouTube quota resets at midnight Pacific): applies migrations, rolls observations up into `creator_daily` and deletes raw rows older than 7 days, then runs `npm run daily`:
  - Twitch profiles for new creators, and a scan of stream titles for competitor names and codes (free).
  - Twitch audience metrics, once per creator per day, for everyone seen on a target title in the last 30 days: followers (with a daily snapshot, so growth shows after a week), clips made in the last 30 days and their views, content classification labels (Gambling, Mature game, …) and the branded-content flag. About 2 requests per creator, paced to Twitch's rate limit.
  - YouTube, each stage capped to its share of the 10,000 units/day (see `src/config/youtube.ts`): links from Twitch bios, promo-code search, discovery search, vetting, refresh of tracked channels. The refresh also records likes and comments, giving each channel an engagement rate: the median of (likes + comments) / views over recent uploads. It costs no extra quota.
- `setup-db.yml`, manual: applies migrations and seeds games and competitors.

Scheduled workflows stay off until the repo variable `POLLER_ENABLED` is `true`.

### Scheduling from Supabase

GitHub's own cron starts runs late or skips them (16 of ~216 polls ran over one weekend). Supabase starts them on time instead: `pg_cron` calls GitHub's "run workflow" API, and runs started that way begin promptly.

1. Create a fine-grained token at github.com/settings/personal-access-tokens/new. Under repository access, pick only this repo. Under permissions, set Actions to Read and write. Note its expiry date: when it expires, runs stop (the Overview's Poller card goes Stalled). The same token can be `GITHUB_TOKEN` in `.env` for the Run now buttons.
2. In Supabase → SQL Editor, store it (replace the placeholder, run, then clear the editor):
   ```sql
   select vault.create_secret('github_pat_…', 'github_dispatch_token', 'Starts Sourcer workflows');
   ```
3. Paste the contents of `supabase/scheduler.sql` into a new query and run it.
4. Test: run `select private.dispatch_workflow('poll.yml');`, wait a few seconds, then
   `select status_code, content from net._http_response order by created desc limit 5;`
   You want `204`, and a new Poll Twitch run under Actions. A `401` means the token is wrong or expired. A `404` means it lacks Actions access to this repo.

Once runs arrive on schedule, the `schedule:` blocks come out of `poll.yml`, `nightly.yml` and `ads.yml` (keep `workflow_dispatch`).

## Going live

1. **Supabase**: create a project. Under Connect, copy the pooled URL (port 6543, append `?pgbouncer=true`) and the direct URL (port 5432).
2. **Twitch**: enable 2FA on your account, then register an app at dev.twitch.tv/console (Confidential, redirect `http://localhost:3000`). Copy the Client ID and Client Secret.
3. **GitHub**: go to Settings → Secrets and variables → Actions.
   - Secrets: `DATABASE_URL`, `DIRECT_URL`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (later `YOUTUBE_API_KEY`).
   - Variables: `POLLER_ENABLED` = `true`, optionally `VIEWER_FLOOR`.
4. Make sure this branch's workflows are on the **default branch**. GitHub only fires scheduled workflows from there.
5. Actions → **Set up database** → Run workflow. Check its log: each canonical title should list its matched Twitch categories.
6. Actions → **Poll Twitch** → Run workflow once to confirm, then leave the schedule running.

## Viewing the data locally

A browser for what's been collected: poller health, creators across Twitch and YouTube (filter by platform, title, language, viewers, followers and growth, clips, content labels, YouTube views, uploads and engagement, recency), YouTube discovery, sponsor mentions, Meta ads and weekly changes. It shows facts, not rankings. The one thing it writes is the **watchlist**: save creators with ☆, add notes, and monitor them on the Watchlist page (live status, recent numbers vs the week before, latest content, sponsor mentions).

1. Install Node.js 22 from nodejs.org.
2. Clone the repo and switch to the working branch:
   ```sh
   git clone https://github.com/Cullen44/Sourcer
   cd Sourcer
   git checkout claude/brave-heisenberg-0ktvvq
   ```
3. Create a file named `.env` in the `Sourcer` folder with one line, using the same Supabase transaction-pooler string as the `DATABASE_URL` GitHub secret:
   ```
   DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true"
   ```
4. Run:
   ```sh
   npm ci
   npm run dev
   ```
5. Open http://localhost:3000.

`.env` is git-ignored, so the password never gets committed.

**Run now buttons (optional).** The Overview's Jobs panel can start Poll Twitch, Nightly and Meta ads on GitHub. Create a fine-grained token at github.com/settings/personal-access-tokens/new (repository access: only this repo; permissions: Actions → Read and write), add `GITHUB_TOKEN="…"` to `.env`, and restart the viewer. Each job has a cooldown (polls 5 min, Nightly and Meta ads 60 min) and can't be started while already running. The viewer only listens on your own computer (127.0.0.1), so nobody else on your network can press the buttons or edit the watchlist.

To update later: stop the viewer (Ctrl+C), then `git pull`, `npm ci`, `npm run dev`. Use `npm ci` rather than `npm install`: it installs exactly what `package-lock.json` lists without rewriting it, so a later `git pull` isn't blocked by local lockfile changes. `npm run dev` regenerates the database client on every start, and clears the `.next` cache when the schema changed, so a pulled schema change can't leave the viewer out of date.

If `git pull` ever says local changes to `package-lock.json` would be overwritten, discard them with `git checkout -- package-lock.json` and pull again.

## Local development

```sh
cp .env.example .env   # fill in values
npm install
npx prisma migrate deploy
npm run games:seed -- --dry-run   # inspect category matches without writing
npm run poll
npm run rollup
npm test               # integration tests need TEST_DATABASE_URL
```

## YouTube discovery

Discovery is a funnel, so it can't flood the database with every gaming channel on YouTube:

1. **Search**: once a day, one recent-uploads search and one live search per target title (US, English, Gaming category). Every channel found becomes a *candidate*.
2. **Vet**: candidates are checked against the filters in `src/config/youtube.ts`. By default:
   - at least 50% of the last 20 uploads are about a target title;
   - 4+ uploads in the last 30 days;
   - median views on recent uploads between 1,000 and 250,000 (long-form uploads older than 2 days; Shorts ignored when there are enough long videos).
3. **Admit**: at most 25 new channels a day and 400 in total. Rejected channels keep their reason and are only re-checked if they reappear in search after 30 days.

Channels linked from a Twitch creator's bio skip the filters, since the creator is already in scope. Channels found carrying a competitor's code enter as candidates and are vetted like any other.

## Notes

- **Game curation is manual.** Yearly entries (CoD, EA FC, 2K, Madden) are matched by pattern in `src/config/games.ts`. After each new release, re-run *Set up database* and check the log.
- **Hours streamed** credits each observation with the real gap to the next sweep, capped at twice the poll interval. Scheduled runners drift and skip, so counting observations would undercount.
- **Days are UTC.**
- **Exports are git-ignored** (`exports/`). This repo is public; competitor research is not.
