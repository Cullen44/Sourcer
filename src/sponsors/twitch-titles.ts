import type { Db } from "../db";
import { analyze } from "./codes";
import { loadCompetitors } from "./youtube-promo";

/**
 * Scan recent Twitch stream titles for competitor names and codes. Free: the
 * titles are already in stream_observations. One mention per stream.
 */
export async function scanTwitchTitles(db: Db, now = new Date(), days = 2) {
  const competitors = await loadCompetitors(db);
  const since = new Date(now.getTime() - days * 86_400_000);
  const streams = await db.$queryRawUnsafe<
    { stream_id: string; title: string; creator_id: number; login: string; display_name: string; twitch_user_id: string; observed_at: Date; viewer_count: number }[]
  >(
    `SELECT DISTINCT ON (o.stream_id) o.stream_id, o.title, o.creator_id, c.login, c.display_name, c.twitch_user_id,
            o.observed_at, o.viewer_count
     FROM stream_observations o JOIN creators c ON c.id = o.creator_id
     WHERE o.observed_at >= $1
     ORDER BY o.stream_id, o.observed_at DESC`,
    since,
  );

  let mentions = 0;
  let newCodes = 0;
  for (const s of streams) {
    for (const f of analyze(s.title, competitors)) {
      const url = `https://www.twitch.tv/${s.login}#stream-${s.stream_id}`;
      await db.sponsorMention.upsert({
        where: { competitorId_url: { competitorId: f.competitorId, url } },
        create: {
          competitorId: f.competitorId,
          platform: "twitch",
          creatorId: s.creator_id,
          externalChannelId: s.twitch_user_id,
          channelTitle: s.display_name,
          url,
          title: s.title,
          viewCount: BigInt(s.viewer_count),
          promoCode: f.codes[0] ?? null,
          publishedAt: s.observed_at,
          observedAt: now,
        },
        update: { title: s.title },
      });
      mentions++;
      const added = await db.promoCode.createMany({
        data: f.codes.map((code) => ({ competitorId: f.competitorId, code, source: "twitch", firstSeenAt: now })),
        skipDuplicates: true,
      });
      newCodes += added.count;
    }
  }
  return { scanned: streams.length, mentions, newCodes };
}
