import { describe, expect, it } from "vitest";
import { analyze, extractCodes, type CompetitorRef } from "../src/sponsors/codes";

const competitors: CompetitorRef[] = [
  { id: 1, name: "Kalshi", domains: ["kalshi.com"], codes: ["2KSIGNUP"] },
  { id: 2, name: "Polymarket", domains: ["polymarket.com", "poly2016.com"], codes: ["2016"] },
  { id: 3, name: "Underdog Fantasy", domains: ["underdogfantasy.com"], codes: [] },
  { id: 4, name: "PrizePicks", domains: ["prizepicks.com"], codes: [] },
  { id: 5, name: "1v1Me", domains: ["1v1me.com"], codes: [] },
];

describe("extractCodes", () => {
  it.each([
    ["Kalshi Promo Code SLICE | Trade $25, Get Up to $2,000", "SLICE"],
    ["Kalshi code CHEESEPICKS #cheesepicks", "CHEESEPICKS"],
    ['Use Promo Code "ROYAL" for FREE $10 on Kalshi', "ROYAL"],
    ["Best Kalshi promo code CBSSPORTS55: Claim $55 bonus", "CBSSPORTS55"],
    ["Kalshi Promo Code COVERS35: Get a $35 Trading Bonus", "COVERS35"],
    ["referral code: abc123 works", "ABC123"],
  ])("%s -> %s", (text, code) => {
    expect(extractCodes(text).map((c) => c.code)).toContain(code);
  });

  it("ignores prose after 'code'", () => {
    expect(extractCodes("Use my promo code below for a bonus")).toEqual([]);
    expect(extractCodes("How To Use Promo Code On Kalshi")).toEqual([]);
    expect(extractCodes("the code is in the description")).toEqual([]);
  });
});

describe("analyze", () => {
  it("attributes a code to the competitor mentioned", () => {
    expect(analyze("Kalshi Promo Code SLICE | Trade $25", competitors)).toEqual([{ competitorId: 1, codes: ["SLICE"] }]);
  });

  it("counts a known code as a mention even without the brand name", () => {
    expect(analyze("Sign up with 2KSIGNUP tonight", competitors)).toEqual([{ competitorId: 1, codes: ["2KSIGNUP"] }]);
  });

  it("does not treat a short numeric code alone as a mention", () => {
    expect(analyze("Best plays of 2016", competitors)).toEqual([]);
  });

  it("treats 'underdog' as the brand only next to promo language", () => {
    expect(analyze("Underdog run to Grand Champ | Tekken 8", competitors)).toEqual([]);
    expect(analyze("Underdog promo code BIGDOG for a free entry", competitors)).toEqual([
      { competitorId: 3, codes: ["BIGDOG"] },
    ]);
  });

  it("splits codes between two brands by proximity", () => {
    const text = "Kalshi: use code AAA111 for $10.\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nPrizePicks: use code BBB222 for $50.";
    expect(analyze(text, competitors)).toEqual([
      { competitorId: 1, codes: ["AAA111"] },
      { competitorId: 4, codes: ["BBB222"] },
    ]);
  });

  it("treats '1v1Me' as the brand only next to promo language or its domain", () => {
    expect(analyze("1v1me for $50, winner takes all | Tekken 8", competitors)).toEqual([]);
    expect(analyze("Use code CULLEN on 1v1Me to play for cash", competitors)).toEqual([{ competitorId: 5, codes: ["CULLEN"] }]);
    expect(analyze("Wager matches at 1v1me.com tonight", competitors)).toEqual([{ competitorId: 5, codes: [] }]);
  });
});
