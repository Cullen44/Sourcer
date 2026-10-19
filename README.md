# Sourcer

Creator sourcing and competitor watch for **Boba Charge**, which makes EV chargers with built-in QR-code payments for short-term-rental hosts. Two tools share one Postgres database:

- **Creator sourcing**: finds YouTube creators who host or teach short-term rentals (Airbnb, VRBO, co-hosting). Creators who also cover or own EVs are the best fit, so EV coverage is measured, shown and filterable. EV coverage isn't required.
- **Competitor watch**: tracks YouTube videos that mention ChargePoint (Airbnb's official charger partner) or EVmatch (peer-to-peer charger sharing), plus Boba Charge itself as a baseline, along with any promo codes and those brands' Meta ads.

The pipeline does deterministic work only (fetch, store, aggregate). Judging fit happens in a Claude conversation.

## How it runs

GitHub Actions does the work, started on schedule by Supabase (see below). There is no server.

- `nightly.yml`, 08:15 UTC (after the YouTube quota resets at midnight Pacific): applies migrations, seeds the competitor list from `src/config/competitors.ts`, then runs `npm run daily`. Each YouTube stage is capped to its share of the 10,000 units/day (`src/config/youtube.ts`):
  1. **Competitor search**: each brand's `searchQueries`, then known promo codes. Videos that mention a brand become competitor mentions. Their channels become discovery candidates.
  2. **Discovery search**: one search per query in `src/config/topics.ts` (US, English, last 14 days).
  3. **Vetting**: candidates must pass the filters (below).
  4. **Refresh**: tracked channels' recent uploads, likes and comments, and a daily snapshot.
- `ads.yml`, 10:37 UTC: Meta Ad Library, first ~30 active ads per Facebook Page. It does nothing until Page IDs are added to `src/config/competitors.ts`.
- `setup-db.yml`, manual: migrations and competitor seed, for a fresh database.

Workflows stay off until the repo variable `POLLER_ENABLED` is `true`.

### Discovery filters

Discovery is a funnel, so it can't flood the database:

- At least **30%** of the last 20 uploads are about short-term rentals. This is matched on titles and tags, because descriptions often carry "book my Airbnb" boilerplate.
- **2+** uploads in the last 30 days.
- Median views on recent uploads between **300** and **250,000**.
- At most **25** new channels a day and **400** in total.
- Rejected channels are re-checked only if they reappear after 30 days.

**EV share** is the share of recent uploads that mention EVs or charging in the title, tags or description. A creator who lists their Tesla in the description counts. Tune both patterns and the search queries in `src/config/topics.ts`.

### Scheduling from Supabase

GitHub's own cron starts runs late or skips them. Supabase's `pg_cron` calls GitHub's "run workflow" API on time instead.

1. Create a fine-grained token at github.com/settings/personal-access-tokens/new. Limit it to this repo, with Actions → Read and write.
2. In Supabase → SQL Editor, store it:
   ```sql
   select vault.create_secret('github_pat_…', 'github_dispatch_token', 'Starts Sourcer workflows');
   ```
3. Paste `supabase/scheduler.sql` into a new query and run it. It's safe to re-run, and it removes the retired Twitch poll schedule.
4. Test it with `select private.dispatch_workflow('nightly.yml');`. Then run `select status_code from net._http_response order by created desc limit 5;` and look for `204`.

## Viewing the data locally

The viewer covers the Overview, Creators (filter by EV coverage, STR share, subscribers, views, uploads, engagement, recency and competitor mentions), the Watchlist (☆ to save, with notes), Discovery, Sponsors, Ads and Changes. It shows facts, not rankings.

1. Install Node.js 22 from nodejs.org.
2. Clone the repo and switch to the working branch:
   ```sh
   git clone https://github.com/Cullen44/Sourcer
   cd Sourcer
   git checkout claude/brave-heisenberg-0ktvvq
   ```
3. Create `.env` in the `Sourcer` folder with the Supabase transaction-pooler string, the same value as the `DATABASE_URL` GitHub secret:
   ```
   DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true"
   ```
4. Run `npm ci`, then `npm run dev`, and open http://localhost:3000.

To update later: stop the viewer (Ctrl+C), then `git pull`, `npm ci`, `npm run dev`.

**Run now buttons (optional).** Add `GITHUB_TOKEN="…"` to `.env`, using the same token as the scheduler, then restart the viewer. Nightly and Meta ads each have a 60-minute cooldown. The viewer only listens on 127.0.0.1.

## Going live from scratch

1. **Supabase**: create a project and copy the pooled URL (port 6543, `?pgbouncer=true`) and the direct URL (port 5432).
2. **YouTube**: create an API key with the YouTube Data API v3 enabled.
3. **GitHub** → Settings → Secrets and variables → Actions:
   - Secrets: `DATABASE_URL`, `DIRECT_URL`, `YOUTUBE_API_KEY`.
   - Variable: `POLLER_ENABLED` = `true`.
4. Run Actions → **Set up database**, then **Nightly**.
5. Set up the Supabase scheduler (above).

## Local development

```sh
cp .env.example .env   # fill in values
npm ci
npx prisma migrate deploy
npm run competitors:seed
npm test               # integration tests need TEST_DATABASE_URL (a separate, disposable database)
```

## Notes

- **Days are UTC.**
- **Exports are git-ignored** (`exports/`). This repo is public; competitor research is not.
