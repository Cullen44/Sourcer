import { describe, expect, it } from "vitest";
import { describeShape, extractJsonDocs, parseAds, unwrapLink } from "../src/ads/parse";

// Shaped like Ad Library data as community scrapers document it. The live
// format is confirmed by the collector's --probe run against real pages.
const ad = (id: string, extra: Record<string, unknown> = {}, snap: Record<string, unknown> = {}) => ({
  ad_archive_id: id,
  page_id: "108107432370909",
  page_name: "Kalshi",
  is_active: true,
  start_date: 1_790_000_000,
  publisher_platform: ["FACEBOOK", "INSTAGRAM"],
  snapshot: {
    body: { text: "Trade on the game. Use code PLAY10 for $10." },
    title: "Kalshi",
    link_url: "https://l.facebook.com/l.php?u=https%3A%2F%2Fkalshi.com%2Fsign-up%3Futm%3Dfb&h=x",
    cta_text: "Sign Up",
    display_format: "VIDEO",
    ...snap,
  },
  ...extra,
});

const html = (objs: unknown[]) =>
  `<html><body><script type="application/json" data-sjs>${JSON.stringify({ require: [["x", { result: { data: { ads: objs } } }]] })}</script>` +
  `<script type="application/json">not json</script></body></html>`;

describe("Meta Ad Library parsing", () => {
  it("finds ads in embedded HTML JSON and GraphQL responses", () => {
    const gql = `for (;;);${JSON.stringify({ data: { search_results_connection: { edges: [{ node: { collated_results: [ad("2")] } }] } } })}`;
    const ads = parseAds([html([ad("1")]), gql]);
    expect(ads.map((a) => a.adArchiveId).sort()).toEqual(["1", "2"]);
  });

  it("reads the fields and unwraps Facebook's link redirect", () => {
    const [a] = parseAds([html([ad("1")])]);
    expect(a).toMatchObject({
      pageName: "Kalshi",
      isActive: true,
      platforms: ["facebook", "instagram"],
      body: "Trade on the game. Use code PLAY10 for $10.",
      headline: "Kalshi",
      ctaText: "Sign Up",
      landingUrl: "https://kalshi.com/sign-up?utm=fb",
      landingDomain: "kalshi.com",
      displayFormat: "VIDEO",
    });
    expect(a!.startedAt?.toISOString()).toBe(new Date(1_790_000_000 * 1000).toISOString());
  });

  it("falls back to carousel cards when the body is a template", () => {
    const [a] = parseAds([html([ad("1", {}, {
      body: { text: "{{product.brand}}" },
      cards: [{ body: "Pick 2 players. Code DOGDAYS gets $50.", title: "Underdog", link_url: "https://underdogfantasy.com/x" }],
      link_url: null,
    })])]);
    expect(a).toMatchObject({ body: "Pick 2 players. Code DOGDAYS gets $50.", landingDomain: "underdogfantasy.com" });
    expect(a!.allText).not.toContain("{{");
  });

  it("reads HTML-markup bodies", () => {
    const [a] = parseAds([html([ad("1", {}, { body: { markup: { __html: "Line one<br />Line &amp; two" } } })])]);
    expect(a!.body).toBe("Line one\nLine & two");
  });

  it("de-duplicates an ad seen twice, keeping the fuller copy", () => {
    const thin = ad("1", {}, { body: { text: "x" }, title: null });
    const ads = parseAds([html([thin]), html([ad("1")])]);
    expect(ads).toHaveLength(1);
    expect(ads[0]!.body).toContain("PLAY10");
  });

  it("describes the shape without content", () => {
    const shape = describeShape([html([ad("1")])]);
    expect(shape.adObjects).toBe(1);
    expect(shape.topKeys).toContain("ad_archive_id");
    expect(shape.snapshotKeys).toContain("link_url");
  });

  it("tolerates junk", () => {
    expect(extractJsonDocs("for (;;);{bad json")).toEqual([]);
    expect(parseAds(["<html></html>", "", "{}"])).toEqual([]);
    expect(unwrapLink("not a url")).toBeNull();
  });
});
