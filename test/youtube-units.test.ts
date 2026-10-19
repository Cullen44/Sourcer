import { describe, expect, it } from "vitest";
import { videoTopics } from "../src/config/topics";
import { parseDuration } from "../src/youtube/client";
import { computeMetrics, median, vet, type UploadFacts } from "../src/youtube/vetting";

const now = new Date("2026-10-01T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

function uploads(n: number, title: string, views: number, everyDays = 3, duration = 900): UploadFacts[] {
  return Array.from({ length: n }, (_, i) => ({
    title, publishedAt: daysAgo(3 + i * everyDays), viewCount: views, durationSeconds: duration,
  }));
}

describe("videoTopics", () => {
  it.each([
    ["How I Made $80k on Airbnb My First Year", [], "", ["STR"]],
    ["Superhost secrets: 5 amenities guests love", [], "", ["STR"]],
    ["VRBO vs Airbnb for new hosts", [], "", ["STR"]],
    ["Is STR investing dead in 2026?", [], "", ["STR"]],
    ["I installed an EV charger at my Airbnb", [], "", ["STR", "EV"]],
    ["Tesla Model Y road trip", [], "", ["EV"]],
    ["Cabin tour", ["airbnb", "cabin"], "", ["STR"]],
    // EV in the description counts (gear lists, "my Tesla"); STR in the description doesn't (boilerplate).
    ["Cabin tour", [], "Book my Airbnb! Filmed on the drive up in my Rivian", ["EV"]],
    ["Strength training for beginners", [], "", []],
    ["Minecraft hardcore day 100", [], "", []],
  ])("%s", (title, tags, description, topics) => expect(videoTopics({ title, tags, description })).toEqual(topics));
});

describe("vetting", () => {
  it("admits a focused, active, mid-sized channel", () => {
    const m = computeMetrics(uploads(15, "Airbnb hosting tips", 8_000), now);
    expect(m.strShare).toBe(1);
    expect(m.evShare).toBe(0);
    expect(vet(m)).toEqual({ ok: true });
  });

  it("measures EV coverage without requiring it", () => {
    const m = computeMetrics([...uploads(5, "EV charger for my Airbnb", 8_000), ...uploads(5, "Airbnb cleaning checklist", 8_000)], now);
    expect(m.strShare).toBe(1);
    expect(m.evShare).toBe(0.5);
    expect(vet(m)).toEqual({ ok: true });
  });

  it("rejects channels that rarely cover short-term rentals", () => {
    const m = computeMetrics([...uploads(3, "Airbnb update", 8_000), ...uploads(12, "Tesla Model 3 review", 8_000)], now);
    expect(vet(m)).toEqual({ ok: false, reason: "off-topic: 20% of recent uploads about short-term rentals" });
  });

  it("rejects inactive, tiny and huge channels", () => {
    expect(vet(computeMetrics(uploads(10, "Airbnb tips", 8_000, 40), now))).toMatchObject({ reason: "inactive: 1 uploads in 30 days" });
    expect(vet(computeMetrics(uploads(10, "Airbnb tips", 100), now))).toMatchObject({ reason: "too small: median 100 views" });
    expect(vet(computeMetrics(uploads(10, "Airbnb tips", 900_000), now))).toMatchObject({ reason: "too large: median 900,000 views" });
  });

  it("measures long-form uploads when there are enough, ignoring Shorts", () => {
    const m = computeMetrics([...uploads(6, "Airbnb tour", 5_000), ...uploads(10, "Airbnb tour #shorts", 400_000, 1, 30)], now);
    expect(m.medianViews).toBe(5_000);
  });

  it("ignores views on uploads younger than 2 days", () => {
    const m = computeMetrics([{ title: "VRBO", publishedAt: daysAgo(1), viewCount: 50, durationSeconds: 600 }, ...uploads(3, "VRBO", 4_000)], now);
    expect(m.medianViews).toBe(4_000);
  });

  it("engagement is the median per-upload rate, skipping hidden likes", () => {
    const base = uploads(5, "Airbnb", 10_000);
    const m = computeMetrics(
      [
        { ...base[0]!, likeCount: 300, commentCount: 100 }, // 4%
        { ...base[1]!, likeCount: 500, commentCount: 100 }, // 6%
        { ...base[2]!, likeCount: 150, commentCount: 50 }, // 2%
        { ...base[3]!, likeCount: 9_000, commentCount: 1_000 }, // viral outlier, 100%
        { ...base[4]!, likeCount: null, commentCount: 20 }, // likes hidden: left out
      ],
      now,
    );
    expect(m.engagementRate).toBeCloseTo(0.05, 5); // median of 2%, 4%, 6%, 100%
    expect(computeMetrics(uploads(5, "Airbnb", 10_000), now).engagementRate).toBeNull();
  });

  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
  });
});

describe("parseDuration", () => {
  it.each([["PT15M33S", 933], ["PT1H2M", 3720], ["PT45S", 45], ["P1DT1H", 90000]])("%s", (iso, s) =>
    expect(parseDuration(iso)).toBe(s));
});
