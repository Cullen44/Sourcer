import { describe, expect, it } from "vitest";
import { groupAds, type GroupableAd } from "../src/ads/group";

const ad = (id: number, over: Partial<GroupableAd> = {}): GroupableAd => ({
  id, adLibraryId: String(id), competitorId: 1, headline: "New ways to play on Underdog!",
  creativeText: "Prediction markets, fantasy sports, Rips, and more.", ctaText: "Install now",
  landingDomain: "itunes.apple.com", startedAt: new Date("2026-10-01T00:00:00Z"), isActive: true, platforms: ["facebook"], ...over,
});

describe("groupAds", () => {
  it("groups variants with identical copy, button and landing", () => {
    const groups = groupAds([
      ad(1),
      ad(2, { creativeText: "Prediction markets,  fantasy sports, Rips, and more. ", platforms: ["instagram"] }),
      ad(3, { startedAt: new Date("2026-09-20T00:00:00Z"), isActive: false }),
      ad(4, { landingDomain: "play.google.com" }),
      ad(5, { competitorId: 2 }),
      ad(6, { headline: "Something else" }),
    ]);
    expect(groups.map((g) => g.variants.map((v) => v.id))).toEqual([[1, 2, 3], [4], [5], [6]]);
    expect(groups[0]).toMatchObject({ activeVariants: 2, platforms: ["facebook", "instagram"] });
    expect(groups[0]!.firstStarted?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(groups[0]!.ad.id).toBe(1);
  });
});
