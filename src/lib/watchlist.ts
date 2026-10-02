import { db } from "./db";

const DAY = 86_400_000;

/** Whether a Twitch creator or YouTube channel is on the watchlist. */
export async function isSaved(key: { creatorId: number } | { youtubeChannelId: string; linkedCreatorId?: number | null }) {
  if ("creatorId" in key) return !!(await db.savedCreator.findUnique({ where: { creatorId: key.creatorId } }));
  if (key.linkedCreatorId) return !!(await db.savedCreator.findUnique({ where: { creatorId: key.linkedCreatorId } }));
  return !!(await db.savedCreator.findUnique({ where: { youtubeChannelId: key.youtubeChannelId } }));
}

/**
 * Everything on the watchlist with what's worth monitoring: live status,
 * recent numbers with the week before for comparison, latest content, and
 * any competitor sponsor mentions.
 */
export async function getWatchlist() {
  const saved = await db.savedCreator.findMany({
    include: {
      creator: { include: { youtubeChannels: { where: { status: "tracked" }, take: 1 } } },
      youtubeChannel: true,
    },
    orderBy: { savedAt: "desc" },
  });
  const lastPoll = await db.pollRun.findFirst({ where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" } });
  const now = Date.now();

  return Promise.all(
    saved.map(async (s) => {
      const c = s.creator;
      const yt = s.youtubeChannel ?? c?.youtubeChannels[0] ?? null;

      let twitch = null;
      if (c) {
        const [live, week, prevWeek, latest] = await Promise.all([
          lastPoll
            ? db.streamObservation.findFirst({ where: { creatorId: c.id, pollRunId: lastPoll.id }, include: { game: true } })
            : null,
          db.$queryRawUnsafe<{ avg: number | null; streams: number }[]>(
            `SELECT ROUND(AVG(o.viewer_count))::int AS avg, COUNT(DISTINCT o.stream_id)::int AS streams
             FROM stream_observations o JOIN games g ON g.id = o.game_id AND g.is_target
             WHERE o.creator_id = $1 AND o.observed_at >= $2`,
            c.id, new Date(now - 7 * DAY),
          ),
          db.$queryRawUnsafe<{ avg: number | null }[]>(
            `SELECT ROUND(AVG(d.avg_ccv))::int AS avg
             FROM creator_daily d JOIN games g ON g.id = d.game_id AND g.is_target
             WHERE d.creator_id = $1 AND d.date >= $2::date AND d.date < $3::date`,
            c.id, new Date(now - 14 * DAY).toISOString().slice(0, 10), new Date(now - 7 * DAY).toISOString().slice(0, 10),
          ),
          db.streamObservation.findFirst({ where: { creatorId: c.id }, orderBy: { observedAt: "desc" }, include: { game: true } }),
        ]);
        twitch = {
          live: live ? { title: live.title, game: live.game.name, viewers: live.viewerCount } : null,
          avg7d: week[0]?.avg ?? null,
          streams7d: week[0]?.streams ?? 0,
          avgPrev7d: prevWeek[0]?.avg ?? null,
          lastSeenAt: c.lastSeenAt,
          latest: latest ? { title: latest.title, game: latest.game.name, at: latest.observedAt } : null,
        };
      }

      let youtube = null;
      if (yt) {
        const [weekAgo, latestVideo] = await Promise.all([
          db.youtubeChannelDaily.findFirst({
            where: { channelId: yt.channelId, date: { lte: new Date(now - 7 * DAY) } },
            orderBy: { date: "desc" },
          }),
          db.youtubeVideo.findFirst({ where: { channelId: yt.channelId }, orderBy: { publishedAt: "desc" } }),
        ]);
        youtube = {
          channelId: yt.channelId,
          title: yt.title,
          medianViews: yt.medianViews,
          medianViewsWeekAgo: weekAgo?.medianViews ?? null,
          uploads30d: yt.uploads30d,
          subscribers: yt.subscriberCount,
          lastUploadAt: yt.lastUploadAt,
          latestVideo: latestVideo ? { id: latestVideo.videoId, title: latestVideo.title, at: latestVideo.publishedAt } : null,
        };
      }

      const mentions = await db.sponsorMention.findMany({
        where: { OR: [...(c ? [{ creatorId: c.id }] : []), ...(yt ? [{ externalChannelId: yt.channelId }] : [])] },
        include: { competitor: true },
        orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      });
      const competitors = [...new Set(mentions.map((m) => m.competitor.name))];

      return {
        saved: s,
        name: c?.displayName ?? yt?.title ?? yt?.channelId ?? "?",
        link: c ? `/creators/${c.id}` : `/youtube/${yt?.channelId}`,
        twitch,
        youtube,
        mentions: { count: mentions.length, competitors, latest: mentions[0] ?? null },
      };
    }),
  );
}

export type WatchlistEntry = Awaited<ReturnType<typeof getWatchlist>>[number];
