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

export interface CreatorRow {
  id: number;
  login: string;
  display_name: string;
  broadcaster_type: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  titles: string[] | null;
  language: string | null;
  streams: number;
  avg_viewers: number | null;
  has_youtube: boolean;
}

export interface CreatorFilters {
  q: string;
  title: string;
  lang: string;
  page: number;
}

export const PAGE_SIZE = 50;

export async function listCreators(f: CreatorFilters) {
  const where = `
    WHERE ($1 = '' OR c.login ILIKE '%' || $1 || '%' OR c.display_name ILIKE '%' || $1 || '%')
      AND ($2 = '' OR $2 = ANY(s.titles))
      AND ($3 = '' OR s.language = $3)`;
  const stats = `
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(DISTINCT g.canonical_title) FILTER (WHERE g.is_target) AS titles,
             MODE() WITHIN GROUP (ORDER BY o.language) AS language,
             COUNT(DISTINCT o.stream_id) FILTER (WHERE g.is_target)::int AS streams,
             ROUND(AVG(o.viewer_count) FILTER (WHERE g.is_target))::int AS avg_viewers
      FROM stream_observations o
      JOIN games g ON g.id = o.game_id
      WHERE o.creator_id = c.id
    ) s ON true`;
  const args = [f.q.trim(), f.title, f.lang];

  const [rows, total] = await Promise.all([
    db.$queryRawUnsafe<CreatorRow[]>(
      `SELECT c.id, c.login, c.display_name, c.broadcaster_type, c.first_seen_at, c.last_seen_at,
              s.titles, s.language, COALESCE(s.streams, 0) AS streams, s.avg_viewers,
              EXISTS (SELECT 1 FROM youtube_channels y WHERE y.creator_id = c.id) AS has_youtube
       FROM creators c ${stats} ${where}
       ORDER BY c.last_seen_at DESC, c.id
       LIMIT ${PAGE_SIZE} OFFSET $4`,
      ...args,
      (f.page - 1) * PAGE_SIZE,
    ),
    db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM creators c ${stats} ${where}`, ...args),
  ]);
  return { rows, total: total[0]?.n ?? 0 };
}

export async function filterOptions() {
  const [titles, langs] = await Promise.all([
    db.game.findMany({
      where: { isTarget: true },
      distinct: ["canonicalTitle"],
      select: { canonicalTitle: true },
      orderBy: { canonicalTitle: "asc" },
    }),
    db.$queryRawUnsafe<{ language: string; n: number }[]>(
      `SELECT language, COUNT(DISTINCT creator_id)::int AS n FROM stream_observations GROUP BY language ORDER BY n DESC`,
    ),
  ]);
  return { titles: titles.flatMap((t) => (t.canonicalTitle ? [t.canonicalTitle] : [])), langs };
}

export async function getCreator(id: number) {
  const creator = await db.creator.findUnique({
    where: { id },
    include: { youtubeChannels: true, sponsorMentions: { include: { competitor: true }, orderBy: { observedAt: "desc" } } },
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
