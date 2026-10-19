import { db } from "./db";

const DAY = 86_400_000;

/** Whether a YouTube channel is on the watchlist. */
export async function isSaved(youtubeChannelId: string) {
  return !!(await db.savedCreator.findUnique({ where: { youtubeChannelId } }));
}

/**
 * Everything on the watchlist with what's worth monitoring: recent numbers
 * with the week before for comparison, latest upload, and any competitor
 * mentions.
 */
export async function getWatchlist() {
  const saved = await db.savedCreator.findMany({ include: { youtubeChannel: true }, orderBy: { savedAt: "desc" } });
  const now = Date.now();

  return Promise.all(
    saved.map(async (s) => {
      const yt = s.youtubeChannel;
      const [weekAgo, latestVideo, mentions] = await Promise.all([
        db.youtubeChannelDaily.findFirst({
          where: { channelId: yt.channelId, date: { lte: new Date(now - 7 * DAY) } },
          orderBy: { date: "desc" },
        }),
        db.youtubeVideo.findFirst({ where: { channelId: yt.channelId }, orderBy: { publishedAt: "desc" } }),
        db.sponsorMention.findMany({
          where: { externalChannelId: yt.channelId },
          include: { competitor: true },
          orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
        }),
      ]);
      return {
        saved: s,
        name: yt.title ?? yt.channelId,
        channel: yt,
        medianViewsWeekAgo: weekAgo?.medianViews ?? null,
        subscribersWeekAgo: weekAgo?.subscriberCount ?? null,
        latestVideo,
        mentions: { count: mentions.length, competitors: [...new Set(mentions.map((m) => m.competitor.name))], latest: mentions[0] ?? null },
      };
    }),
  );
}

export type WatchlistEntry = Awaited<ReturnType<typeof getWatchlist>>[number];
