-- Schedules the GitHub workflows from Supabase instead of GitHub's own cron,
-- which starts runs late or skips them. pg_cron fires on time and pg_net
-- calls GitHub's "run workflow" API (workflow_dispatch), which runs promptly.
--
-- Run once in Supabase → SQL Editor. Safe to re-run: it updates in place.
-- Before running it, store the GitHub token (see the README, "Scheduling"):
--   select vault.create_secret('github_pat_…', 'github_dispatch_token', 'Starts Sourcer workflows');
-- The token is read from Vault at call time, so it never appears here.
--
-- Not a Prisma migration on purpose: pg_cron, pg_net and Vault are Supabase
-- extensions that the plain Postgres used by CI and tests doesn't have.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Kept out of "public", which Supabase's Data API exposes: nobody outside the
-- database can call this.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.dispatch_workflow(workflow text)
returns bigint
language sql
set search_path = ''
as $$
  select net.http_post(
    url := 'https://api.github.com/repos/Cullen44/Sourcer/actions/workflows/' || workflow || '/dispatches',
    body := jsonb_build_object('ref', 'claude/brave-heisenberg-0ktvvq'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_dispatch_token'),
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type', 'application/json',
      'User-Agent', 'sourcer-scheduler'
    ),
    timeout_milliseconds := 10000
  );
$$;
revoke all on function private.dispatch_workflow(text) from public;

-- Times are UTC. Scheduling an existing job name replaces its schedule.
-- Keep POLL_INTERVAL_MINUTES (nightly.yml, .env) equal to the poll spacing.
select cron.schedule('sourcer-poll',    '7,27,47 * * * *', $$select private.dispatch_workflow('poll.yml')$$);
select cron.schedule('sourcer-nightly', '15 8 * * *',      $$select private.dispatch_workflow('nightly.yml')$$);
select cron.schedule('sourcer-ads',     '37 10 * * *',     $$select private.dispatch_workflow('ads.yml')$$);

-- Checking it works:
--   select private.dispatch_workflow('poll.yml');   -- start a poll now
--   select status_code, content, created from net._http_response order by created desc limit 5;
--     204 = GitHub accepted it. 401 = bad/expired token. 404 = token lacks Actions access to the repo.
--   select jobname, status, return_message, start_time from cron.job_run_details
--     join cron.job using (jobid) order by start_time desc limit 10;
--
-- Changing the token later:
--   select vault.update_secret((select id from vault.secrets where name = 'github_dispatch_token'), 'github_pat_…');
-- Stopping:
--   select cron.unschedule('sourcer-poll');  -- likewise sourcer-nightly, sourcer-ads
