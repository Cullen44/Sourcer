import type { Db } from "./db";

export interface RollupOptions {
  /** Expected minutes between sweeps; credit for the latest sweep and the cap on gaps. */
  pollIntervalMinutes: number;
  /** Raw observations older than this many days are deleted after rollup. */
  retentionDays?: number;
  now?: Date;
}

export interface RollupSummary {
  from: string;
  to: string;
  dailyRows: number;
  deletedObservations: number;
}

/**
 * Collapse raw observations into creator_daily (per creator, per game, per UTC
 * day) and delete raw rows past retention.
 *
 * Idempotent: every complete day still fully held in raw form is recomputed
 * and upserted, so a missed nightly run heals on the next one.
 *
 * Hours streamed: each observation is credited with the real gap until the
 * next successful sweep, capped at 2x the poll interval. Scheduled runners
 * drift and occasionally skip, so counting observations x interval would
 * undercount.
 */
export async function runRollup(db: Db, opts: RollupOptions): Promise<RollupSummary> {
  const retentionDays = opts.retentionDays ?? 7;
  const today = utcDate(opts.now ?? new Date());
  const from = addDays(today, -(retentionDays - 1));
  const cutoff = addDays(today, -retentionDays);
  const intervalH = opts.pollIntervalMinutes / 60;
  const maxGapH = intervalH * 2;

  const dailyRows = await db.$executeRawUnsafe(
    `
    WITH runs AS (
      SELECT id,
             EXTRACT(EPOCH FROM (LEAD(started_at) OVER (ORDER BY started_at) - started_at)) / 3600.0 AS gap_h
      FROM poll_runs
      WHERE finished_at IS NOT NULL
    )
    INSERT INTO creator_daily
      (creator_id, game_id, date, avg_ccv, peak_ccv, hours_streamed, sessions, last_title, language)
    SELECT o.creator_id,
           o.game_id,
           o.observed_at::date,
           AVG(o.viewer_count)::float8,
           MAX(o.viewer_count),
           SUM(LEAST(COALESCE(r.gap_h, $3::float8), $4::float8))::float8,
           COUNT(DISTINCT o.stream_id)::int,
           (ARRAY_AGG(o.title ORDER BY o.observed_at DESC))[1],
           MODE() WITHIN GROUP (ORDER BY o.language)
    FROM stream_observations o
    JOIN runs r ON r.id = o.poll_run_id
    WHERE o.observed_at >= $1::date AND o.observed_at < $2::date
    GROUP BY o.creator_id, o.game_id, o.observed_at::date
    ON CONFLICT (creator_id, game_id, date) DO UPDATE SET
      avg_ccv = EXCLUDED.avg_ccv,
      peak_ccv = EXCLUDED.peak_ccv,
      hours_streamed = EXCLUDED.hours_streamed,
      sessions = EXCLUDED.sessions,
      last_title = EXCLUDED.last_title,
      language = EXCLUDED.language
    `,
    from,
    today,
    intervalH,
    maxGapH,
  );

  const deletedObservations = await db.$executeRawUnsafe(
    `DELETE FROM stream_observations WHERE observed_at < $1::date`,
    cutoff,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM poll_runs p WHERE started_at < $1::date
       AND NOT EXISTS (SELECT 1 FROM stream_observations o WHERE o.poll_run_id = p.id)`,
    cutoff,
  );

  return { from, to: today, dailyRows, deletedObservations };
}

/** YYYY-MM-DD in UTC. */
export function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDate(d);
}
