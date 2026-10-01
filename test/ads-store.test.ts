import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PageResult } from "../src/ads/collect";
import type { ParsedAd } from "../src/ads/parse";
import { storeResult } from "../src/ads/store";
import { createDb } from "../src/db";

const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : null;
const PAGE = "108107432370909";

const ad = (id: string, text = "Trade the game."): ParsedAd => ({
  adArchiveId: id, pageId: PAGE, pageName: "Kalshi", isActive: true, startedAt: new Date("2026-09-20T00:00:00Z"), endedAt: null,
  platforms: ["facebook"], body: text, headline: "Kalshi", ctaText: "Sign Up", landingUrl: "https://kalshi.com/x",
  landingDomain: "kalshi.com", displayFormat: "IMAGE", collationCount: 1, allText: text,
});
const result = (status: PageResult["status"], ads: ParsedAd[], complete = status === "ok"): PageResult => ({
  status, ads, complete, reported: complete ? ads.length : null, detail: "", shape: { adObjects: ads.length, topKeys: [], snapshotKeys: [] },
});
const t = (h: number) => new Date(Date.UTC(2026, 9, 1, h));

describe.skipIf(!db)("storing Meta ads", () => {
  let competitorId = 0;
  beforeEach(async () => {
    await db!.$executeRawUnsafe(`TRUNCATE ad_collection_runs, competitor_ads, promo_codes, sponsor_mentions, competitors RESTART IDENTITY CASCADE`);
    competitorId = (await db!.competitor.create({ data: { name: "Kalshi", domains: ["kalshi.com"], knownCodes: [], fbPageIds: [PAGE] } })).id;
  });
  afterAll(async () => db?.$disconnect());

  it("records new ads and codes, then marks unseen ads stopped after an ok run", async () => {
    const day1 = await storeResult(db!, { id: competitorId, codes: [] }, PAGE, result("ok", [ad("1", "Use code PLAY10 for $10"), ad("2")]), t(1), t(1));
    expect(day1).toEqual({ newAds: 2, stopped: 0, newCodes: ["PLAY10"] });

    const day2 = await storeResult(db!, { id: competitorId, codes: ["PLAY10"] }, PAGE, result("ok", [ad("2"), ad("3")]), t(2), t(2));
    expect(day2).toMatchObject({ newAds: 1, stopped: 1 });

    const ads = await db!.competitorAd.findMany({ orderBy: { adLibraryId: "asc" } });
    expect(ads.map((a) => [a.adLibraryId, a.isActive, a.promoCode])).toEqual([["1", false, "PLAY10"], ["2", true, null], ["3", true, null]]);
    expect(ads[0]!.stoppedAt?.toISOString()).toBe(t(2).toISOString());
    expect((await db!.promoCode.findFirstOrThrow()).source).toBe("ad");
  });

  it("never marks ads stopped after a blocked, empty or failed run", async () => {
    await storeResult(db!, { id: competitorId, codes: [] }, PAGE, result("ok", [ad("1")]), t(1), t(1));
    for (const status of ["blocked", "empty", "error"] as const) {
      expect((await storeResult(db!, { id: competitorId, codes: [] }, PAGE, result(status, []), t(2), t(2))).stopped).toBe(0);
    }
    expect((await db!.competitorAd.findFirstOrThrow()).isActive).toBe(true);
    expect(await db!.adCollectionRun.count()).toBe(4);
  });

  it("never marks ads stopped after a partial run", async () => {
    await storeResult(db!, { id: competitorId, codes: [] }, PAGE, result("ok", [ad("1"), ad("2")]), t(1), t(1));
    const partial = await storeResult(db!, { id: competitorId, codes: [] }, PAGE, result("ok", [ad("2")], false), t(2), t(2));
    expect(partial.stopped).toBe(0);
    expect(await db!.competitorAd.count({ where: { isActive: true } })).toBe(2);
  });

  it("revives an ad that reappears", async () => {
    await storeResult(db!, { id: competitorId, codes: [] }, PAGE, result("ok", [ad("1"), ad("2")]), t(1), t(1));
    await storeResult(db!, { id: competitorId, codes: [] }, PAGE, result("ok", [ad("2")]), t(2), t(2));
    await storeResult(db!, { id: competitorId, codes: [] }, PAGE, result("ok", [ad("1"), ad("2")]), t(3), t(3));
    expect(await db!.competitorAd.findUniqueOrThrow({ where: { adLibraryId: "1" } })).toMatchObject({ isActive: true, stoppedAt: null });
  });
});
