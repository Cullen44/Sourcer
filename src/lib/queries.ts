import { groupAds } from "../ads/group";
import { db } from "./db";

/**
 * Read-only queries for the viewer. Facts only: no scores or rankings.
 */

export async function getOverview() {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [channels, new24h, competitors, mentions, ev] = await Promise.all([
    db.youtubeChannel.count({ where: { status: "tracked" } }),
    db.youtubeChannel.count({ where: { status: "tracked", vettedAt: { gte: dayAgo } } }),
    db.competitor.count(),
    db.sponsorMention.count(),
    db.youtubeChannel.count({ where: { status: "tracked", evShare: { gt: 0 } } }),
  ]);
  return { channels, new24h, competitors, mentions, ev };
}

/** One row per tracked YouTube channel. */
export interface CreatorRow {
  channel_id: string;
  name: string;
  handle: string | null;
  country: string | null;
  str_share: number | null;
  ev_share: number | null;
  subscribers: bigint | null;
  median_views: number | null;
  uploads_30d: number | null;
  engagement: number | null;
  last_upload: Date | null;
  saved: boolean;
  mentions: number;
}

export interface CreatorFilters {
  q: string;
  page: number;
  /** "any" | "ev" (some EV content) | "none" (no EV content). */
  ev: string;
  /** Percent, e.g. 25 = at least a quarter of uploads mention EVs. */
  evShareMin?: number | null;
  /** Percent of uploads about short-term rentals. */
  strShareMin?: number | null;
  subsMin?: number | null;
  subsMax?: number | null;
  viewsMin?: number | null;
  viewsMax?: number | null;
  uploadsMin?: number | null;
  /** Percent, e.g. 3 = at least 3% engagement. */
  engagementMin?: number | null;
  /** Uploaded within this many days. */
  activeDays?: number | null;
  savedOnly?: boolean;
  /** Only channels seen mentioning a tracked competitor. */
  mentionsOnly?: boolean;
}

export const PAGE_SIZE = 50;

export async function listCreators(f: CreatorFilters) {
  const where = `
    FROM youtube_channels y
    WHERE y.status = 'tracked'
      AND ($1 = '' OR y.title ILIKE '%' || $1 || '%' OR y.handle ILIKE '%' || $1 || '%')
      AND ($2 = 'any' OR ($2 = 'ev' AND y.ev_share > 0) OR ($2 = 'none' AND COALESCE(y.ev_share, 0) = 0))
      AND ($3::float8 IS NULL OR y.ev_share >= $3::float8 / 100)
      AND ($4::float8 IS NULL OR y.str_share >= $4::float8 / 100)
      AND ($5::bigint IS NULL OR y.subscriber_count >= $5::bigint)
      AND ($6::bigint IS NULL OR y.subscriber_count <= $6::bigint)
      AND ($7::int IS NULL OR y.median_views >= $7::int)
      AND ($8::int IS NULL OR y.median_views <= $8::int)
      AND ($9::int IS NULL OR y.uploads_30d >= $9::int)
      AND ($10::float8 IS NULL OR y.engagement_rate >= $10::float8 / 100)
      AND ($11::int IS NULL OR y.last_upload_at >= now() - make_interval(days => $11::int))
      AND (NOT $12::boolean OR EXISTS (SELECT 1 FROM saved_creators sc WHERE sc.youtube_channel_id = y.channel_id))
      AND (NOT $13::boolean OR EXISTS (SELECT 1 FROM sponsor_mentions m WHERE m.external_channel_id = y.channel_id))`;
  const args = [
    f.q.trim(), f.ev, f.evShareMin ?? null, f.strShareMin ?? null, f.subsMin ?? null, f.subsMax ?? null,
    f.viewsMin ?? null, f.viewsMax ?? null, f.uploadsMin ?? null, f.engagementMin ?? null, f.activeDays ?? null,
    f.savedOnly ?? false, f.mentionsOnly ?? false,
  ];
  const [rows, total] = await Promise.all([
    db.$queryRawUnsafe<CreatorRow[]>(
      `SELECT y.channel_id, COALESCE(y.title, y.channel_id) AS name, y.handle, y.country,
              y.str_share, y.ev_share, y.subscriber_count AS subscribers, y.median_views, y.uploads_30d,
              y.engagement_rate AS engagement, y.last_upload_at AS last_upload,
              EXISTS (SELECT 1 FROM saved_creators sc WHERE sc.youtube_channel_id = y.channel_id) AS saved,
              (SELECT COUNT(*)::int FROM sponsor_mentions m WHERE m.external_channel_id = y.channel_id) AS mentions
       ${where}
       ORDER BY y.ev_share DESC NULLS LAST, y.last_upload_at DESC NULLS LAST, y.channel_id
       LIMIT ${PAGE_SIZE} OFFSET $14`,
      ...args,
      (f.page - 1) * PAGE_SIZE,
    ),
    db.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n ${where}`, ...args),
  ]);
  return { rows, total: total[0]?.n ?? 0 };
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
      include: { competitor: true },
    }),
  ]);
  return { competitors, mentions };
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

export interface YoutubeFilters {
  q: string;
  status: string;
  source: string;
  page: number;
}

export async function listYoutubeChannels(f: YoutubeFilters) {
  const where = {
    status: f.status || "tracked",
    ...(f.source ? { source: f.source } : {}),
    ...(f.q.trim()
      ? { OR: [{ title: { contains: f.q.trim(), mode: "insensitive" as const } }, { handle: { contains: f.q.trim(), mode: "insensitive" as const } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.youtubeChannel.findMany({
      where,
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
