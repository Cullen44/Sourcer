import { groupAds } from "../ads/group";
import { db } from "./db";

/**
 * Read-only queries for the viewer. Facts only: no scores or rankings.
 * "Recent" figures come from raw observations, which are kept for 7 days.
 */

const POLL_INTERVAL_MIN = Number(process.env.POLL_INTERVAL_MINUTES ?? 20);

export async function getOverview() {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [lastRun, lastOk, runs24h, failed24h, creators, newCreators24h, observations, competitors, mentions, byTitle] =
    await Promise.all([
      db.pollRun.findFirst({ orderBy: { startedAt: "desc" } }),
      db.pollRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" } }),
      db.pollRun.count({ where: { startedAt: { gte: dayAgo } } }),
      db.pollRun.count({ where: { startedAt: { gte: dayAgo }, error: { not: null } } }),
      db.creator.count(),
      db.creator.count({ where: { firstSeenAt: { gte: dayAgo } } }),
      db.streamObservation.count(),
      db.competitor.count(),
      db.sponsorMention.count(),
      db.$queryRawUnsafe<{ title: string; streams: number; creators: number }[]>(`
        SELECT g.canonical_title AS title,
               COUNT(*)::int AS streams,
               COUNT(DISTINCT o.creator_id)::int AS creators
        FROM stream_observations o
        JOIN games g ON g.id = o.game_id AND g.is_target
        WHERE o.poll_run_id = (SELECT id FROM poll_runs WHERE finished_at IS NOT NULL ORDER BY started_at DESC LIMIT 1)
        GROUP BY g.canonical_title
        ORDER BY g.canonical_title`),
    ]);
  return { lastRun, lastOk, runs24h, failed24h, creators, newCreators24h, observations, competitors, mentions, byTitle };
}

export type Platform = "all" | "twitch" | "youtube";

/**
 * One row per creator across platforms. A Twitch creator with a tracked
 * YouTube channel is a single "twitch" row carrying both sets of figures;
 * YouTube channels not linked to a Twitch creator are their own rows.
 */
export interface CreatorRow {
  platform: "twitch" | "youtube";
  key: string;
  twitch_id: number | null;
  twitch_name: string | null;
  name: string;
  titles: string[] | null;
  language: string | null;
  broadcaster_type: string | null;
  streams: number | null;
  avg_viewers: number | null;
  yt_channel_id: string | null;
  yt_median_views: number | null;
  yt_uploads_30d: number | null;
  yt_engagement: number | null;
  last_active: Date | null;
  saved: boolean;
  followers: number | null;
  /** Follower change over the last ~7 days (0.05 = +5%), once a week of snapshots exists. */
  followers_growth: number | null;
  clips_30d: number | null;
  clip_views_30d: number | null;
  labels: string[] | null;
  branded: boolean | null;
}

export interface CreatorFilters {
  q: string;
  title: string;
  lang: string;
  platform: Platform;
  page: number;
  /** Numeric filters; null = not set. A Twitch filter only matches creators with Twitch data, likewise YouTube. */
  twitchViewersMin?: number | null;
  twitchViewersMax?: number | null;
  twitchStreamsMin?: number | null;
  ytViewsMin?: number | null;
  ytViewsMax?: number | null;
  ytUploadsMin?: number | null;
  /** Active within this many days. */
  activeDays?: number | null;
  /** Only creators on the watchlist. */
  savedOnly?: boolean;
  followersMin?: number | null;
  followersMax?: number | null;
  /** Percent, e.g. 5 = grew at least 5% in the last week. */
  followerGrowthMin?: number | null;
  clipsMin?: number | null;
  clipViewsMin?: number | null;
  /** "" any, "none" no labels, "+Gambling" has the label, "-Gambling" doesn't. */
  label?: string;
  /** Percent, e.g. 3 = at least 3% engagement. */
  ytEngagementMin?: number | null;
}

export const PAGE_SIZE = 50;

export async function listCreators(f: CreatorFilters) {
  // $1 q, $2 title, $3 lang, $4 platform
  const union = `
    WITH tw AS (
      SELECT 'twitch'::text AS platform, c.id::text AS key, c.id AS twitch_id, c.display_name AS twitch_name,
             c.display_name AS name,
             COALESCE(s.titles, '{}') || CASE WHEN y.primary_title IS NULL THEN '{}'::text[] ELSE ARRAY[y.primary_title] END AS titles,
             s.language, c.broadcaster_type, COALESCE(s.streams, 0) AS streams, s.avg_viewers,
             y.channel_id AS yt_channel_id, y.median_views AS yt_median_views, y.uploads_30d AS yt_uploads_30d,
             y.engagement_rate AS yt_engagement,
             GREATEST(c.last_seen_at, y.last_upload_at) AS last_active,
             c.login AS search_a, y.title AS search_b,
             EXISTS (SELECT 1 FROM saved_creators sc WHERE sc.creator_id = c.id) AS saved,
             c.followers,
             CASE WHEN fp.followers > 0 AND c.followers IS NOT NULL THEN (c.followers - fp.followers)::float8 / fp.followers END AS followers_growth,
             c.clips_30d, c.clip_views_30d, c.content_labels AS labels, c.branded_content AS branded
      FROM creators c
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(DISTINCT g.canonical_title) FILTER (WHERE g.is_target) AS titles,
               MODE() WITHIN GROUP (ORDER BY o.language) AS language,
               COUNT(DISTINCT o.stream_id) FILTER (WHERE g.is_target)::int AS streams,
               ROUND(AVG(o.viewer_count) FILTER (WHERE g.is_target))::int AS avg_viewers
        FROM stream_observations o JOIN games g ON g.id = o.game_id
        WHERE o.creator_id = c.id
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT * FROM youtube_channels y WHERE y.creator_id = c.id AND y.status = 'tracked' ORDER BY y.id LIMIT 1
      ) y ON true
      LEFT JOIN LATERAL (
        -- The snapshot from about a week ago, for follower growth.
        SELECT d.followers FROM creator_twitch_daily d
        WHERE d.creator_id = c.id AND d.followers IS NOT NULL
          AND d.date BETWEEN CURRENT_DATE - 14 AND CURRENT_DATE - 7
        ORDER BY d.date DESC LIMIT 1
      ) fp ON true
    ),
    yt AS (
      SELECT 'youtube'::text, y.channel_id, y.creator_id, c.display_name, COALESCE(y.title, y.channel_id),
             CASE WHEN y.primary_title IS NULL THEN '{}'::text[] ELSE ARRAY[y.primary_title] END,
             NULL::text, NULL::text, NULL::int, NULL::int,
             y.channel_id, y.median_views, y.uploads_30d, y.engagement_rate, y.last_upload_at,
             y.handle, NULL::text,
             EXISTS (SELECT 1 FROM saved_creators sc WHERE sc.youtube_channel_id = y.channel_id OR (y.creator_id IS NOT NULL AND sc.creator_id = y.creator_id)),
             NULL::int, NULL::float8, NULL::int, NULL::int, NULL::text[], NULL::boolean
      FROM youtube_channels y LEFT JOIN creators c ON c.id = y.creator_id
      WHERE y.status = 'tracked' AND ($4 = 'youtube' OR y.creator_id IS NULL)
    ),
    u AS (
      SELECT * FROM tw WHERE $4 IN ('all', 'twitch')
      UNION ALL
      SELECT * FROM yt WHERE $4 IN ('all', 'youtube')
    )
    SELECT * FROM u
    WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR search_a ILIKE '%' || $1 || '%' OR search_b ILIKE '%' || $1 || '%')
      AND ($2 = '' OR $2 = ANY(titles))
      AND ($3 = '' OR language = $3)
      AND ($5::int IS NULL OR avg_viewers >= $5::int)
      AND ($6::int IS NULL OR avg_viewers <= $6::int)
      AND ($7::int IS NULL OR streams >= $7::int)
      AND ($8::int IS NULL OR yt_median_views >= $8::int)
      AND ($9::int IS NULL OR yt_median_views <= $9::int)
      AND ($10::int IS NULL OR yt_uploads_30d >= $10::int)
      AND ($11::int IS NULL OR last_active >= (now() AT TIME ZONE 'UTC') - make_interval(days => $11::int))
      AND (NOT $12::boolean OR saved)
      AND ($13::int IS NULL OR followers >= $13::int)
      AND ($14::int IS NULL OR followers <= $14::int)
      AND ($15::float8 IS NULL OR followers_growth >= $15::float8 / 100)
      AND ($16::int IS NULL OR clips_30d >= $16::int)
      AND ($17::int IS NULL OR clip_views_30d >= $17::int)
      AND ($18 = ''
           OR ($18 = 'none' AND cardinality(labels) = 0)
           OR (left($18, 1) = '+' AND substr($18, 2) = ANY(labels))
           OR (left($18, 1) = '-' AND labels IS NOT NULL AND NOT substr($18, 2) = ANY(labels)))
      AND ($19::float8 IS NULL OR yt_engagement >= $19::float8 / 100)`;
  const args = [
    f.q.trim(), f.title, f.lang, f.platform,
    f.twitchViewersMin ?? null, f.twitchViewersMax ?? null, f.twitchStreamsMin ?? null,
    f.ytViewsMin ?? null, f.ytViewsMax ?? null, f.ytUploadsMin ?? null, f.activeDays ?? null,
    f.savedOnly ?? false,
    f.followersMin ?? null, f.followersMax ?? null, f.followerGrowthMin ?? null,
    f.clipsMin ?? null, f.clipViewsMin ?? null, f.label ?? "", f.ytEngagementMin ?? null,
  ];

  const [rows, total] = await Promise.all([
    db.$queryRawUnsafe<CreatorRow[]>(
      `${union} ORDER BY last_active DESC NULLS LAST, key LIMIT ${PAGE_SIZE} OFFSET $20`,
      ...args,
      (f.page - 1) * PAGE_SIZE,
    ),
    db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM (${union}) x`, ...args),
  ]);
  return { rows, total: total[0]?.n ?? 0 };
}

export async function filterOptions() {
  const [titles, langs, labels] = await Promise.all([
    db.game.findMany({
      where: { isTarget: true },
      distinct: ["canonicalTitle"],
      select: { canonicalTitle: true },
      orderBy: { canonicalTitle: "asc" },
    }),
    db.$queryRawUnsafe<{ language: string; n: number }[]>(
      `SELECT language, COUNT(DISTINCT creator_id)::int AS n FROM stream_observations GROUP BY language ORDER BY n DESC`,
    ),
    db.$queryRawUnsafe<{ label: string; n: number }[]>(
      `SELECT label, COUNT(*)::int AS n FROM creators, UNNEST(content_labels) AS label GROUP BY label ORDER BY n DESC`,
    ),
  ]);
  return { titles: titles.flatMap((t) => (t.canonicalTitle ? [t.canonicalTitle] : [])), langs, labels };
}

export async function getCreator(id: number) {
  const creator = await db.creator.findUnique({
    where: { id },
    include: {
      youtubeChannels: true,
      sponsorMentions: { include: { competitor: true }, orderBy: { observedAt: "desc" } },
      twitchDaily: { orderBy: { date: "desc" }, take: 30 },
    },
  });
  if (!creator) return null;

  const [games, streams, daily] = await Promise.all([
    db.$queryRawUnsafe<
      { name: string; canonical_title: string | null; is_target: boolean; streams: number; avg_viewers: number; peak: number; hours: number }[]
    >(
      `SELECT g.name, g.canonical_title, g.is_target,
              COUNT(DISTINCT o.stream_id)::int AS streams,
              ROUND(AVG(o.viewer_count))::int AS avg_viewers,
              MAX(o.viewer_count) AS peak,
              ROUND((COUNT(*) * $2::float8 / 60)::numeric, 1)::float8 AS hours
       FROM stream_observations o JOIN games g ON g.id = o.game_id
       WHERE o.creator_id = $1
       GROUP BY g.id
       ORDER BY hours DESC`,
      id,
      POLL_INTERVAL_MIN,
    ),
    db.$queryRawUnsafe<
      { stream_id: string; title: string; game: string; is_target: boolean; started_at: Date; peak: number; language: string }[]
    >(
      `SELECT DISTINCT ON (o.stream_id, g.id)
              o.stream_id, o.title, g.name AS game, g.is_target, o.started_at, o.language,
              MAX(o.viewer_count) OVER (PARTITION BY o.stream_id, g.id) AS peak
       FROM stream_observations o JOIN games g ON g.id = o.game_id
       WHERE o.creator_id = $1
       ORDER BY o.stream_id, g.id, o.observed_at DESC`,
      id,
    ),
    db.creatorDaily.findMany({
      where: { creatorId: id },
      include: { game: true },
      orderBy: [{ date: "desc" }],
      take: 60,
    }),
  ]);
  streams.sort((a, b) => b.started_at.getTime() - a.started_at.getTime());
  return { creator, games, streams: streams.slice(0, 30), daily };
}

export async function getSponsors(f: { competitor?: number; minViews?: number } = {}) {
  const [competitors, mentions] = await Promise.all([
    db.competitor.findMany({
      orderBy: [{ priority: "asc" }, { name: "asc" }],
      include: { _count: { select: { ads: { where: { isActive: true } }, mentions: true, codes: true } } },
    }),
    db.sponsorMention.findMany({
      where: {
        ...(f.competitor ? { competitorId: f.competitor } : {}),
        ...(f.minViews ? { viewCount: { gte: BigInt(f.minViews) } } : {}),
      },
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      take: 200,
      include: { competitor: true, creator: true },
    }),
  ]);
  return { competitors, mentions };
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

export interface YoutubeFilters {
  q: string;
  title: string;
  status: string;
  source: string;
  page: number;
}

export async function listYoutubeChannels(f: YoutubeFilters) {
  const where = {
    status: f.status || "tracked",
    ...(f.title ? { primaryTitle: f.title } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.q.trim()
      ? { OR: [{ title: { contains: f.q.trim(), mode: "insensitive" as const } }, { handle: { contains: f.q.trim(), mode: "insensitive" as const } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.youtubeChannel.findMany({
      where,
      include: { creator: { select: { id: true, displayName: true } } },
      orderBy: [{ lastUploadAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      take: PAGE_SIZE,
      skip: (f.page - 1) * PAGE_SIZE,
    }),
    db.youtubeChannel.count({ where }),
  ]);
  return { rows, total };
}

export async function youtubeStatusCounts() {
  const rows = await db.youtubeChannel.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>;
}

export async function getYoutubeChannel(channelId: string) {
  const channel = await db.youtubeChannel.findUnique({
    where: { channelId },
    include: {
      creator: { select: { id: true, displayName: true, login: true } },
      videos: { orderBy: { publishedAt: "desc" }, take: 25 },
      daily: { orderBy: { date: "desc" }, take: 30 },
    },
  });
  if (!channel) return null;
  const mentions = await db.sponsorMention.findMany({
    where: { externalChannelId: channelId },
    include: { competitor: true },
    orderBy: { publishedAt: "desc" },
  });
  return { channel, mentions };
}

export async function getYoutubeOverview() {
  const { quotaDay } = await import("../youtube/usage");
  const [counts, usage] = await Promise.all([
    youtubeStatusCounts(),
    db.youtubeUsage.findUnique({ where: { date: new Date(`${quotaDay()}T00:00:00Z`) } }),
  ]);
  return { counts, unitsToday: usage?.units ?? 0 };
}

export async function getPromoCodes() {
  return db.promoCode.findMany({
    include: { competitor: true },
    orderBy: [{ competitor: { priority: "asc" } }, { competitor: { name: "asc" } }, { firstSeenAt: "asc" }],
  });
}

// ---------------------------------------------------------------------------
// Meta ads
// ---------------------------------------------------------------------------

/** Ads matching the filters, with identical variants grouped into one entry. */
export async function listAds(f: { competitor?: number; status: string; q: string }) {
  const ads = await db.competitorAd.findMany({
    where: {
      ...(f.competitor ? { competitorId: f.competitor } : {}),
      ...(f.status === "active" ? { isActive: true } : f.status === "stopped" ? { isActive: false } : {}),
      ...(f.q.trim()
        ? { OR: [{ creativeText: { contains: f.q.trim(), mode: "insensitive" as const } }, { headline: { contains: f.q.trim(), mode: "insensitive" as const } }, { promoCode: { contains: f.q.trim(), mode: "insensitive" as const } }] }
        : {}),
    },
    include: { competitor: true },
    orderBy: [{ startedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: 2000,
  });
  return groupAds(ads);
}

export async function adSummary() {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const competitors = await db.competitor.findMany({ orderBy: [{ priority: "asc" }, { name: "asc" }] });
  return Promise.all(
    competitors.map(async (c) => {
      // Latest run per Page; a competitor is fully visible only if every Page's latest run was complete.
      const runs = await Promise.all(
        c.fbPageIds.map((pageId) => db.adCollectionRun.findFirst({ where: { competitorId: c.id, pageId }, orderBy: { startedAt: "desc" } })),
      );
      const latest = runs.filter((r) => r !== null);
      const activeAds = await db.competitorAd.findMany({ where: { competitorId: c.id, isActive: true } });
      return {
        competitor: c,
        active: activeAds.length,
        distinct: groupAds(activeAds).length,
        newThisWeek: await db.competitorAd.count({ where: { competitorId: c.id, firstObservedAt: { gte: weekAgo } } }),
        stoppedThisWeek: await db.competitorAd.count({ where: { competitorId: c.id, stoppedAt: { gte: weekAgo } } }),
        lastRun: latest.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null,
        reported: latest.some((r) => r.reportedCount !== null) ? latest.reduce((n, r) => n + (r.reportedCount ?? 0), 0) : null,
        allComplete: latest.length > 0 && latest.length === c.fbPageIds.length && latest.every((r) => r.complete),
      };
    }),
  );
}

/**
 * Health of the Meta ad collector: the latest run of every configured Page.
 * "ok" only when each Page's latest run was clean and recent.
 */
export async function adCollectorHealth(staleHours = 36) {
  const competitors = await db.competitor.findMany({ where: { fbPageIds: { isEmpty: false } } });
  const latest = (
    await Promise.all(
      competitors.flatMap((c) =>
        c.fbPageIds.map(async (pageId) => ({
          competitor: c.name,
          run: await db.adCollectionRun.findFirst({ where: { competitorId: c.id, pageId }, orderBy: { startedAt: "desc" } }),
        })),
      ),
    )
  );
  const staleBefore = Date.now() - staleHours * 3_600_000;
  const failed = latest.filter((l) => !l.run || (l.run.status !== "ok" && !(l.run.status === "empty" && l.run.reportedCount === 0)));
  const stale = latest.filter((l) => l.run && l.run.startedAt.getTime() < staleBefore);
  const lastRun = latest.map((l) => l.run?.startedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { pages: latest.length, failed, stale, lastRun, ok: latest.length > 0 && failed.length === 0 && stale.length === 0 };
}
