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
| 2 | Sponsor watch: Meta Ad Library, promo-code lookup, weekly diff | Next |
| 3 | Twitch user + YouTube enrichment | |
| 4 | Scoring + CSV/Markdown export | Needs ~1 week of data |
| 5 | Local viewer (browse only, no rankings) | Done |

## How it runs

GitHub Actions, no server:

- `poll.yml`, every 20 min: live streams on each target game down to `VIEWER_FLOOR`, plus every tracked creator's live stream in *any* category. Without that second sweep, relevance (share of streaming on target titles) can't be computed.
- `nightly.yml`: rolls observations up into `creator_daily` and deletes raw rows older than 7 days.
- `setup-db.yml`, manual: applies migrations and seeds games and competitors.

Scheduled workflows stay off until the repo variable `POLLER_ENABLED` is `true`.

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

A read-only browser for what's been collected: poller health, creators (search, filter by title and language) with their recent streams, and sponsor mentions. It shows facts, not rankings.

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
   npm install
   npm run dev
   ```
5. Open http://localhost:3000.

`.env` is git-ignored, so the password never gets committed.

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

## Notes

- **Game curation is manual.** Yearly entries (CoD, EA FC, 2K, Madden) are matched by pattern in `src/config/games.ts`. After each new release, re-run *Set up database* and check the log.
- **Hours streamed** credits each observation with the real gap to the next sweep, capped at twice the poll interval. Scheduled runners drift and skip, so counting observations would undercount.
- **Days are UTC.**
- **Exports are git-ignored** (`exports/`). This repo is public; competitor research is not.
