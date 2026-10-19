import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db";
import { DISCOVERY_QUERIES } from "../src/config/topics";
import { runPromoSearch } from "../src/sponsors/youtube-promo";
import { BudgetExceeded, YouTubeClient, type FetchLike } from "../src/youtube/client";
import { refreshTracked, searchCandidates, vetCandidates } from "../src/youtube/discover";

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
               saved_creators, competitor_ads, ad_collection_runs, competitors
      RESTART IDENTITY CASCADE`);
  });
  afterAll(async () => db?.$disconnect());

  it("discovery admits only channels that pass the filters", async () => {
    const yt = fakeYouTube(
      {
        UCgood: { title: "HostAcademy", videos: [...uploads("g", 9, "Airbnb hosting tips", 9_000), ...uploads("e", 3, "Tesla charger for guests", 9_000)] },
        UCvariety: { title: "RealEstateDad", videos: [...uploads("v", 3, "Airbnb first look", 9_000), ...uploads("w", 9, "Buying my first duplex", 9_000)] },
        UCtiny: { title: "TinyHost", videos: uploads("t", 12, "VRBO host checklist", 120) },
      },
      { "airbnb host tips": ["g0", "v0", "t0"] },
    );
    const search = await searchCandidates(db!, yt, now);
    expect(search.newCandidates).toBe(3);
    expect(search.searches).toBe(DISCOVERY_QUERIES.length);

    const vetted = await vetCandidates(db!, yt, now);
    expect(vetted).toMatchObject({ admitted: 1, rejected: 2 });

    const rows = await db!.youtubeChannel.findMany({ orderBy: { channelId: "asc" } });
    expect(rows.map((r) => [r.title, r.status, r.rejectReason])).toEqual([
      ["HostAcademy", "tracked", null],
      ["TinyHost", "rejected", "too small: median 120 views"],
      ["RealEstateDad", "rejected", "off-topic: 25% of recent uploads about short-term rentals"],
    ]);
    const good = rows.find((r) => r.channelId === "UCgood")!;
    expect(good.strShare).toBe(0.75);
    expect(good.evShare).toBe(0.25);
    expect(good.medianViews).toBe(9_000);
    expect(await db!.youtubeVideo.count({ where: { channelId: "UCgood" } })).toBe(12);

    // Seen again tomorrow: rejected channels are not re-vetted (no spend).
    const again = await searchCandidates(db!, yt, new Date(now.getTime() + 86_400_000));
    expect(again).toMatchObject({ newCandidates: 0, reopened: 0 });
  });

  it("caps admissions per day; overflow waits as candidates", async () => {
    const channels: Record<string, FakeChannel> = {};
    for (let i = 0; i < 30; i++) channels[`UC${i}`] = { title: `Host${i}`, videos: uploads(`c${i}-`, 10, "Airbnb superhost tips", 5_000) };
    const yt = fakeYouTube(channels, { "airbnb superhost": Object.keys(channels).map((id) => `${id.replace("UC", "c")}-0`) });
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
    const yt = fakeYouTube({ UCa: { title: "A", videos: uploads("a", 5, "Airbnb tips", 3_000) } }, {});
    yt.allowance = 250; // enough for 2 searches, not all
    await expect(searchCandidates(db!, yt, now)).rejects.toBeInstanceOf(BudgetExceeded);
    expect(yt.unitsUsed).toBe(200);
  });

  it("competitor search records mentions, learns new codes, and makes channels candidates", async () => {
    const cp = await db!.competitor.create({ data: { name: "ChargePoint", domains: ["chargepoint.com"], knownCodes: [], priority: 1 } });
    await db!.promoCode.create({ data: { competitorId: cp.id, code: "HOSTCHARGE", source: "seed" } });
    const yt = fakeYouTube(
      {
        UCq: { title: "Cabin Hosts", videos: [{ id: "q1", title: 'Use Discount Code "ROYAL" for $25 off a ChargePoint at your Airbnb', views: 2_991, daysAgo: 5 }] },
        UCx: { title: "Random", videos: [{ id: "x1", title: "Unrelated video", views: 10, daysAgo: 5 }] },
      },
      // Searches come from config/competitors.ts (two for ChargePoint), then known codes.
      { "ChargePoint airbnb": ["q1", "x1"], '"ROYAL" ChargePoint': ["q1"] },
    );
    const stats = await runPromoSearch(db!, yt, now);
    expect(stats).toMatchObject({ searches: 3, mentions: 1, newCodes: 1 });

    const m = await db!.sponsorMention.findFirstOrThrow();
    expect(m).toMatchObject({ promoCode: "ROYAL", channelTitle: "Cabin Hosts", externalChannelId: "UCq", viewCount: 2991n });
    expect((await db!.promoCode.findMany()).map((c) => c.code).sort()).toEqual(["HOSTCHARGE", "ROYAL"]);
    expect(await db!.youtubeChannel.findUniqueOrThrow({ where: { channelId: "UCq" } })).toMatchObject({ source: "sponsor", status: "candidate" });

    // Next run searches the new code too; the mention is updated, not duplicated.
    const next = await runPromoSearch(db!, yt, now);
    expect(next.searches).toBe(4);
    expect(await db!.sponsorMention.count()).toBe(1);
  });

  it("refreshes tracked channels once a day and snapshots them", async () => {
    const yt = fakeYouTube({ UCr: { title: "EVHost", videos: uploads("r", 6, "Airbnb EV charger install", 4_000) } }, {});
    await db!.youtubeChannel.create({ data: { channelId: "UCr", source: "discovery", status: "tracked", fetchedAt: new Date(now.getTime() - 86_400_000) } });
    expect(await refreshTracked(db!, yt, now)).toEqual({ refreshed: 1 });
    expect(await refreshTracked(db!, yt, now)).toEqual({ refreshed: 0 }); // already done today
    expect(await db!.youtubeChannel.findUniqueOrThrow({ where: { channelId: "UCr" } })).toMatchObject({ title: "EVHost", strShare: 1, evShare: 1 });
    expect(await db!.youtubeChannelDaily.count()).toBe(1);
  });
});
