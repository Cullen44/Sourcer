import { describe, expect, it } from "vitest";
import { matchYoutubeTitle } from "../src/config/games";
import { parseDuration } from "../src/youtube/client";
import { extractYoutubeRef } from "../src/youtube/twitch-links";
import { computeMetrics, median, vet, type UploadFacts } from "../src/youtube/vetting";

const now = new Date("2026-10-01T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

function uploads(n: number, title: string, views: number, everyDays = 3, duration = 900): UploadFacts[] {
  return Array.from({ length: n }, (_, i) => ({
    title, publishedAt: daysAgo(3 + i * everyDays), viewCount: views, durationSeconds: duration,
  }));
}

describe("matchYoutubeTitle", () => {
  it.each([
    ["Best SMG in Black Ops 7 Ranked", "Call of Duty"],
    ["NBA 2K27 MyCareer Ep. 4", "NBA 2K"],
    ["FC 27 Ultimate Team pack opening", "EA FC"],
    ["Madden 27 Franchise rebuild", "Madden"],
    ["CS2 clutch highlights", "Counter-Strike"],
    ["Tekken 8 Jin combos", "Tekken"],
    ["SF6 Ranked to Master", "Street Fighter"],
    ["Minecraft hardcore day 100", null],
  ])("%s -> %s", (text, title) => expect(matchYoutubeTitle(text)).toBe(title));
});

describe("vetting", () => {
  it("admits a focused, active, mid-sized channel", () => {
    const m = computeMetrics(uploads(15, "Tekken 8 ranked", 8_000), now);
    expect(m.primaryTitle).toBe("Tekken");
    expect(m.titleShare).toBe(1);
    expect(vet(m)).toEqual({ ok: true });
  });

  it("rejects general gaming channels", () => {
    const m = computeMetrics([...uploads(5, "Tekken 8 ranked", 8_000), ...uploads(10, "Minecraft survival", 8_000)], now);
    expect(vet(m)).toEqual({ ok: false, reason: "off-topic: 33% of recent uploads on target titles" });
  });

  it("rejects inactive, tiny and huge channels", () => {
    expect(vet(computeMetrics(uploads(10, "Madden 27", 8_000, 20), now))).toMatchObject({ reason: "inactive: 2 uploads in 30 days" });
    expect(vet(computeMetrics(uploads(10, "Madden 27", 300), now))).toMatchObject({ reason: "too small: median 300 views" });
    expect(vet(computeMetrics(uploads(10, "Madden 27", 900_000), now))).toMatchObject({ reason: "too large: median 900,000 views" });
  });

  it("measures long-form uploads when there are enough, ignoring Shorts", () => {
    const m = computeMetrics([...uploads(6, "NBA 2K27", 5_000), ...uploads(10, "NBA 2K27 #shorts", 400_000, 1, 30)], now);
    expect(m.medianViews).toBe(5_000);
  });

  it("ignores views on uploads younger than 2 days", () => {
    const m = computeMetrics([{ title: "SF6", publishedAt: daysAgo(1), viewCount: 50, durationSeconds: 600 }, ...uploads(3, "SF6", 4_000)], now);
    expect(m.medianViews).toBe(4_000);
  });

  it("engagement is the median per-upload rate, skipping hidden likes", () => {
    const base = uploads(5, "Tekken 8", 10_000);
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
    expect(computeMetrics(uploads(5, "Tekken 8", 10_000), now).engagementRate).toBeNull();
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

describe("extractYoutubeRef", () => {
  it.each([
    ["YT: https://www.youtube.com/@CoolGuy", { kind: "handle", handle: "CoolGuy" }],
    ["youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw", { kind: "channel", id: "UC_x5XG1OV2P6uZZ5FSM9Ttw" }],
    ["https://youtube.com/user/oldname", { kind: "user", name: "oldname" }],
    ["https://www.youtube.com/c/CustomName", { kind: "custom", name: "CustomName" }],
    ["just a bio, no links", null],
  ])("%s", (text, ref) => expect(extractYoutubeRef(text)).toEqual(ref));
});
