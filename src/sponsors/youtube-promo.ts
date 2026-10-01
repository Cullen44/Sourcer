import type { Db } from "../db";
import { PROMO_SEARCH } from "../config/youtube";
import type { YouTubeClient } from "../youtube/client";
import { analyze, type CompetitorRef } from "./codes";

const DAY = 86_400_000;

export async function loadCompetitors(db: Db): Promise<CompetitorRef[]> {
  const rows = await db.competitor.findMany({ include: { codes: true }, orderBy: [{ priority: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ id: r.id, name: r.name, domains: r.domains, codes: r.codes.map((c) => c.code) }));
}

/**
 * Search YouTube for each competitor ("Name" promo code), then for known codes
 * oldest-searched first, until the stage budget runs out. Every video that
 * mentions a competitor becomes a sponsor mention; codes found in it are added
 * to promo_codes so they get searched in turn. Channels found this way become
 * discovery candidates, so gaming creators among them get vetted like any other.
 */
export async function runPromoSearch(db: Db, yt: YouTubeClient, now = new Date()) {
  const competitors = await loadCompetitors(db);
  const publishedAfter = new Date(now.getTime() - PROMO_SEARCH.publishedWithinDays * DAY);
  const stats = { searches: 0, mentions: 0, newCodes: 0 };

  const queries: { q: string; codeId?: number }[] = competitors.map((c) => ({ q: `"${c.name}" promo code` }));
  const codes = await db.promoCode.findMany({
    orderBy: [{ lastSearchedAt: { sort: "asc", nulls: "first" } }, { firstSeenAt: "asc" }],
    include: { competitor: true },
  });
  for (const code of codes) queries.push({ q: `"${code.code}" ${code.competitor.name}`, codeId: code.id });

  for (const { q, codeId } of queries) {
    const results = await yt.search(q, { publishedAfter, maxResults: PROMO_SEARCH.maxResults });
    stats.searches++;
    if (codeId) await db.promoCode.update({ where: { id: codeId }, data: { lastSearchedAt: now } });

    // search.list truncates descriptions; videos.list returns them whole, plus views.
    const ids = results.flatMap((r) => (r.id.videoId ? [r.id.videoId] : []));
    const videos = ids.length ? await yt.videos(ids) : [];
    const r = await recordVideos(db, competitors, videos, now);
    stats.mentions += r.mentions;
    stats.newCodes += r.newCodes;
  }
  return stats;
}

async function recordVideos(
  db: Db,
  competitors: CompetitorRef[],
  videos: Awaited<ReturnType<YouTubeClient["videos"]>>,
  now: Date,
) {
  let mentions = 0;
  let newCodes = 0;
  for (const v of videos) {
    const findings = analyze(`${v.snippet.title}\n${v.snippet.description}`, competitors);
    if (findings.length === 0) continue;

    const channel = await db.youtubeChannel.upsert({
      where: { channelId: v.snippet.channelId },
      create: { channelId: v.snippet.channelId, title: v.snippet.channelTitle, source: "sponsor", status: "candidate", lastSeenInSearch: now },
      update: {},
    });

    for (const f of findings) {
      const url = `https://www.youtube.com/watch?v=${v.id}`;
      const data = {
        platform: "youtube",
        creatorId: channel.creatorId,
        externalChannelId: v.snippet.channelId,
        channelTitle: v.snippet.channelTitle,
        title: v.snippet.title,
        viewCount: v.statistics?.viewCount ? BigInt(v.statistics.viewCount) : null,
        promoCode: f.codes[0] ?? null,
        publishedAt: new Date(v.snippet.publishedAt),
      };
      await db.sponsorMention.upsert({
        where: { competitorId_url: { competitorId: f.competitorId, url } },
        create: { competitorId: f.competitorId, url, observedAt: now, ...data },
        update: { viewCount: data.viewCount, creatorId: data.creatorId },
      });
      mentions++;

      const added = await db.promoCode.createMany({
        data: f.codes.map((code) => ({ competitorId: f.competitorId, code, source: "youtube", firstSeenAt: now })),
        skipDuplicates: true,
      });
      newCodes += added.count;
      // Keep the in-memory list current so later videos in this run match new codes too.
      const comp = competitors.find((c) => c.id === f.competitorId)!;
      for (const code of f.codes) if (!comp.codes.includes(code)) comp.codes.push(code);
    }
  }
  return { mentions, newCodes };
}
