import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db";
import { runPromoSearch } from "../src/sponsors/youtube-promo";
import type { FetchLike } from "../src/twitch/client";
import { BudgetExceeded, YouTubeClient } from "../src/youtube/client";
import { refreshTracked, searchCandidates, vetCandidates } from "../src/youtube/discover";
import { linkTwitchCreators } from "../src/youtube/twitch-links";

// End-to-end YouTube stages against real Postgres, with a scripted fake API.
const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : null;
const now = new Date("2026-10-01T12:00:00Z");

interface FakeVideo { id: string; title: string; views: number; daysAgo: number; description?: string }
interface FakeChannel { title: string; videos: FakeVideo[] }

/** A tiny YouTube: channels with uploads, and canned search results by query. */
function fakeYouTube(channels: Record<string, FakeChannel>, searches: Record<string, string[]>) {
  const videoIndex = new Map<string, { channelId: string; v: FakeVideo }>();
  for (const [channelId, c] of Object.entries(channels)) for (const v of c.videos) videoIndex.set(v.id, { channelId, v });
  const snippet = (channelId: string, v: FakeVideo) => ({
    channelId, channelTitle: channels[channelId]!.title, title: v.title, description: v.description ?? "",
    publishedAt: new Date(now.getTime() - v.daysAgo * 86_400_000).toISOString(),
  });

  const fetchImpl: FetchLike = async (raw) => {
    const u = new URL(raw);
    const resource = u.pathname.split("/").pop();
    const p = u.searchParams;
    if (resource === "search") {
      const ids = searches[p.get("q")!] ?? [];
      return Response.json({ items: ids.map((id) => ({ id: { videoId: id }, snippet: snippet(videoIndex.get(id)!.channelId, videoIndex.get(id)!.v) })) });
    }
    if (resource === "channels") {
      const ids = p.get("id")?.split(",") ?? [];
      const handle = p.get("forHandle")?.slice(1);
      const found = handle ? Object.keys(channels).filter((id) => channels[id]!.title === handle) : ids.filter((id) => channels[id]);
      return Response.json({ items: found.map((id) => ({
        id, snippet: { title: channels[id]!.title },
        statistics: { subscriberCount: "1000", viewCount: "100000", videoCount: String(channels[id]!.videos.length) },
        contentDetails: { relatedPlaylists: { uploads: `UU${id}` } },
      })) });
    }
    if (resource === "playlistItems") {
      const id = p.get("playlistId")!.slice(2);
      return Response.json({ items: (channels[id]?.videos ?? []).map((v) => ({ contentDetails: { videoId: v.id } })) });
    }
    if (resource === "videos") {
      const ids = p.get("id")!.split(",");
      return Response.json({ items: ids.filter((id) => videoIndex.has(id)).map((id) => {
        const { channelId, v } = videoIndex.get(id)!;
        return { id, snippet: snippet(channelId, v), statistics: { viewCount: String(v.views) }, contentDetails: { duration: "PT15M" } };
      }) });
    }
    throw new Error(`unexpected ${raw}`);
  };
  return new YouTubeClient("test-key", fetchImpl);
}

const uploads = (prefix: string, n: number, title: string, views: number): FakeVideo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, title, views, daysAgo: 3 + i * 2 }));

describe.skipIf(!db)("YouTube stages", () => {
  beforeEach(async () => {
    await db!.$executeRawUnsafe(`
      TRUNCATE youtube_usage, youtube_channel_daily, youtube_videos, youtube_channels, promo_codes, sponsor_mentions,
               creator_daily, stream_observations, poll_runs, creator_scores, creators, games, competitor_ads, competitors
      RESTART IDENTITY CASCADE`);
  });
  afterAll(async () => db?.$disconnect());

  it("discovery admits only channels that pass the filters", async () => {
    const yt = fakeYouTube(
      {
        UCgood: { title: "TekkenTeacher", videos: uploads("g", 12, "Tekken 8 ranked guide", 9_000) },
        UCvariety: { title: "VarietyGamer", videos: [...uploads("v", 3, "Tekken 8 first look", 9_000), ...uploads("w", 9, "Minecraft day 100", 9_000)] },
        UCtiny: { title: "TinyTekken", videos: uploads("t", 12, "Tekken 8 combo", 120) },
      },
      { "Tekken 8": ["g0", "v0", "t0"] },
    );
    const search = await searchCandidates(db!, yt, now);
    expect(search.newCandidates).toBe(3);
    expect(search.searches).toBe(14); // 7 titles x (uploads + live)

    const vetted = await vetCandidates(db!, yt, now);
    expect(vetted).toMatchObject({ admitted: 1, rejected: 2 });

    const rows = await db!.youtubeChannel.findMany({ orderBy: { channelId: "asc" } });
    expect(rows.map((r) => [r.title, r.status, r.rejectReason])).toEqual([
      ["TekkenTeacher", "tracked", null],
      ["TinyTekken", "rejected", "too small: median 120 views"],
      ["VarietyGamer", "rejected", "off-topic: 25% of recent uploads on target titles"],
    ]);
    const good = rows.find((r) => r.channelId === "UCgood")!;
    expect(good.primaryTitle).toBe("Tekken");
    expect(good.medianViews).toBe(9_000);
    expect(await db!.youtubeVideo.count({ where: { channelId: "UCgood" } })).toBe(12);

    // Seen again tomorrow: rejected channels are not re-vetted (no spend).
    const again = await searchCandidates(db!, yt, new Date(now.getTime() + 86_400_000));
    expect(again).toMatchObject({ newCandidates: 0, reopened: 0 });
  });

  it("caps admissions per day; overflow waits as candidates", async () => {
    const channels: Record<string, FakeChannel> = {};
    for (let i = 0; i < 30; i++) channels[`UC${i}`] = { title: `SF6Pro${i}`, videos: uploads(`c${i}-`, 10, "Street Fighter 6 ranked", 5_000) };
    const yt = fakeYouTube(channels, { "Street Fighter 6": Object.keys(channels).map((id) => `${id.replace("UC", "c")}-0`) });
    await searchCandidates(db!, yt, now);
    const vetted = await vetCandidates(db!, yt, now);
    expect(vetted.admitted).toBe(25);
    expect(await db!.youtubeChannel.count({ where: { status: "candidate" } })).toBe(5);
    // Same day again: no slots, so nothing is vetted and no units are spent.
    const before = yt.unitsUsed;
    expect((await vetCandidates(db!, yt, now)).admitted).toBe(0);
    expect(yt.unitsUsed).toBe(before);
  });

  it("stops at the stage budget and keeps what it already fetched", async () => {
    const yt = fakeYouTube({ UCa: { title: "A", videos: uploads("a", 5, "Madden 27", 3_000) } }, {});
    yt.allowance = 250; // enough for 2 searches, not 14
    await expect(searchCandidates(db!, yt, now)).rejects.toBeInstanceOf(BudgetExceeded);
    expect(yt.unitsUsed).toBe(200);
  });

  it("promo search records mentions, learns new codes, and makes channels candidates", async () => {
    const kalshi = await db!.competitor.create({ data: { name: "Kalshi", domains: ["kalshi.com"], knownCodes: [], priority: 1 } });
    await db!.promoCode.create({ data: { competitorId: kalshi.id, code: "2KSIGNUP", source: "seed" } });
    const yt = fakeYouTube(
      {
        UCq: { title: "Queen Gaming", videos: [{ id: "q1", title: 'Use Promo Code "ROYAL" for FREE $10 on Kalshi', views: 2_991, daysAgo: 5 }] },
        UCx: { title: "Random", videos: [{ id: "x1", title: "Unrelated video", views: 10, daysAgo: 5 }] },
      },
      { '"Kalshi" promo code': ["q1", "x1"], '"ROYAL" Kalshi': ["q1"] },
    );
    const stats = await runPromoSearch(db!, yt, now);
    expect(stats).toMatchObject({ searches: 2, mentions: 1, newCodes: 1 });

    const m = await db!.sponsorMention.findFirstOrThrow();
    expect(m).toMatchObject({ promoCode: "ROYAL", channelTitle: "Queen Gaming", externalChannelId: "UCq", viewCount: 2991n });
    expect((await db!.promoCode.findMany()).map((c) => c.code).sort()).toEqual(["2KSIGNUP", "ROYAL"]);
    expect(await db!.youtubeChannel.findUniqueOrThrow({ where: { channelId: "UCq" } })).toMatchObject({ source: "sponsor", status: "candidate" });

    // Next run searches the new code too; the mention is updated, not duplicated.
    const next = await runPromoSearch(db!, yt, now);
    expect(next.searches).toBe(3);
    expect(await db!.sponsorMention.count()).toBe(1);
  });

  it("links Twitch creators from bio links and refreshes them without vetting", async () => {
    await db!.creator.create({
      data: { twitchUserId: "t1", login: "streamer", displayName: "Streamer", enrichedAt: now,
              description: "Pro player. YouTube: https://www.youtube.com/@StreamerYT" },
    });
    await db!.creator.create({ data: { twitchUserId: "t2", login: "nolink", displayName: "NoLink", enrichedAt: now, description: "hi" } });
    const yt = fakeYouTube({ UCs: { title: "StreamerYT", videos: uploads("s", 3, "Minecraft", 50) } }, {});

    expect(await linkTwitchCreators(db!, yt, now)).toEqual({ checked: 2, linked: 1 });
    expect(await linkTwitchCreators(db!, yt, now)).toEqual({ checked: 0, linked: 0 }); // not re-checked

    await refreshTracked(db!, yt, now);
    const ch = await db!.youtubeChannel.findUniqueOrThrow({ where: { channelId: "UCs" } });
    // Off-topic and tiny, but tracked anyway: it belongs to a Twitch creator already in scope.
    expect(ch).toMatchObject({ status: "tracked", source: "twitch_link", title: "StreamerYT", creatorId: 1 });
    expect((await db!.creator.findUniqueOrThrow({ where: { id: 1 } })).youtubeChannelId).toBe("UCs");
  });
});
