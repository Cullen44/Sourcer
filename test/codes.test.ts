import { describe, expect, it } from "vitest";
import { analyze, extractCodes, type CompetitorRef } from "../src/sponsors/codes";

const competitors: CompetitorRef[] = [
  { id: 1, name: "ChargePoint", domains: ["chargepoint.com"], codes: ["HOSTCHARGE"] },
  { id: 2, name: "EVmatch", domains: ["evmatch.com"], codes: ["2026"] },
  { id: 3, name: "Boba Charge", domains: ["bobacharge.com"], codes: [] },
];

describe("extractCodes", () => {
  it.each([
    ["ChargePoint Promo Code SLICE | $50 off a Home Flex", "SLICE"],
    ["ChargePoint code HOSTS #airbnbhost", "HOSTS"],
    ['Use Discount Code "ROYAL" for $25 off on EVmatch', "ROYAL"],
    ["Best ChargePoint promo code STR55: save $55", "STR55"],
    ["referral code: abc123 works", "ABC123"],
  ])("%s -> %s", (text, code) => {
    expect(extractCodes(text).map((c) => c.code)).toContain(code);
  });

  it("ignores prose after 'code'", () => {
    expect(extractCodes("Use my promo code below for a bonus")).toEqual([]);
    expect(extractCodes("How To Use Promo Code On ChargePoint")).toEqual([]);
    expect(extractCodes("the code is in the description")).toEqual([]);
  });
});

describe("analyze", () => {
  it("attributes a code to the competitor mentioned", () => {
    expect(analyze("ChargePoint Promo Code SLICE | $50 off", competitors)).toEqual([{ competitorId: 1, codes: ["SLICE"] }]);
  });

  it("counts a known code as a mention even without the brand name", () => {
    expect(analyze("Get your charger with HOSTCHARGE tonight", competitors)).toEqual([{ competitorId: 1, codes: ["HOSTCHARGE"] }]);
  });

  it("does not treat a short numeric code alone as a mention", () => {
    expect(analyze("Best Airbnbs of 2026", competitors)).toEqual([]);
  });

  it("treats 'charge point' as ChargePoint only next to promo language", () => {
    expect(analyze("Every guest asks where the nearest charge point is", competitors)).toEqual([]);
    expect(analyze("Charge Point discount code HOST50 for hosts", competitors)).toEqual([{ competitorId: 1, codes: ["HOST50"] }]);
  });

  it("matches Boba Charge by name, one-word spelling and domain", () => {
    expect(analyze("I added a Boba Charge to my Airbnb", competitors)).toEqual([{ competitorId: 3, codes: [] }]);
    expect(analyze("#bobacharge review", competitors)).toEqual([{ competitorId: 3, codes: [] }]);
    expect(analyze("Get one at bobacharge.com", competitors)).toEqual([{ competitorId: 3, codes: [] }]);
    expect(analyze("Best boba tea near my rental", competitors)).toEqual([]);
  });

  it("splits codes between two brands by proximity", () => {
    const text = "ChargePoint: use code AAA111 for $10.\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nEVmatch: use code BBB222 for $50.";
    expect(analyze(text, competitors)).toEqual([
      { competitorId: 1, codes: ["AAA111"] },
      { competitorId: 2, codes: ["BBB222"] },
    ]);
  });
});
