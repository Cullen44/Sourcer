import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db";
import { TwitchClient, type FetchLike } from "../src/twitch/client";
import { collectTwitchMetrics } from "../src/twitch/metrics";

// Daily Twitch audience metrics against real Postgres, with a scripted Helix.
const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : null;
const now = new Date("2026-10-02T09:00:00Z");

interface FakeUser { followers: number; clips: number[]; labels: string[]; branded?: boolean }

function fakeHelix(users: Record<string, FakeUser>, opts: { followersStatus?: number } = {}) {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (raw) => {
    const u = new URL(raw);
    if (u.hostname === "id.twitch.tv") return Response.json({ access_token: "tok" });
    const path = u.pathname.replace("/helix", "");
    calls.push(path);
    const p = u.searchParams;
    if (path === "/channels") {
      const ids = p.getAll("broadcaster_id").filter((id) => users[id]);
      return Response.json({ data: ids.map((id) => ({ broadcaster_id: id, content_classification_labels: users[id]!.labels, is_branded_content: !!users[id]!.branded })) });
    }
    if (path === "/channels/followers") {
      if (opts.followersStatus) return new Response("Missing User OAUTH Token", { status: opts.followersStatus });
      return Response.json({ data: [], total: users[p.get("broadcaster_id")!]!.followers, pagination: {} });
    }
    if (path === "/clips") {
      const all = users[p.get("broadcaster_id")!]!.clips;
      const start = Number(p.get("after") ?? 0);
      const page = all.slice(start, start + 100);
      const more = start + 100 < all.length;
      return Response.json({ data: page.map((v, i) => ({ id: `c${start + i}`, view_count: v })), pagination: more ? { cursor: String(start + 100) } : {} });
    }
    throw new Error(`unexpected ${raw}`);
  };
  return { twitch: new TwitchClient("id", "secret", fetchImpl), calls };
}

async function creator(twitchUserId: string, lastSeenDaysAgo = 1) {
  return db!.creator.create({
    data: { twitchUserId, login: twitchUserId, displayName: twitchUserId, lastSeenAt: new Date(now.getTime() - lastSeenDaysAgo * 86_400_000) },
  });
}

describe.skipIf(!db)("collectTwitchMetrics", () => {
  beforeEach(async () => {
    await db!.$executeRawUnsafe(`TRUNCATE creator_twitch_daily, creators RESTART IDENTITY CASCADE`);
  });
  afterAll(async () => db?.$disconnect());

  it("stores followers, clips, labels and a daily snapshot, once per day", async () => {
    await creator("a");
    await creator("b");
    await creator("stale", 60); // not seen on a target title for 60 days: skipped
    await creator("banned"); // Twitch no longer returns the channel
    const users: Record<string, FakeUser> = {
      a: { followers: 12_000, clips: Array(250).fill(10), labels: ["Gambling", "MatureGame"], branded: true },
      b: { followers: 800, clips: [], labels: [] },
      stale: { followers: 1, clips: [], labels: [] },
    };
    const { twitch, calls } = fakeHelix(users);
    const res = await collectTwitchMetrics(db!, twitch, { now });

    expect(res).toMatchObject({ creators: 3, done: 2, gone: 1, followers: "ok" });
    const a = await db!.creator.findUniqueOrThrow({ where: { twitchUserId: "a" } });
    expect(a).toMatchObject({ followers: 12_000, clips30d: 250, clipViews30d: 2_500, contentLabels: ["Gambling", "MatureGame"], brandedContent: true });
    expect(calls.filter((c) => c === "/clips")).toHaveLength(3 + 1); // a paginates 3 pages, b one
    const snaps = await db!.creatorTwitchDaily.findMany({ orderBy: { creatorId: "asc" } });
    expect(snaps.map((s) => [s.followers, s.clips30d])).toEqual([[12_000, 250], [800, 0]]);
    expect((await db!.creator.findUniqueOrThrow({ where: { twitchUserId: "stale" } })).metricsAt).toBeNull();

    // Same day again: nothing left to do.
    const again = fakeHelix(users);
    expect(await collectTwitchMetrics(db!, again.twitch, { now: new Date(now.getTime() + 3_600_000) })).toMatchObject({ creators: 0 });
    expect(again.calls).toHaveLength(0);
  });

  it("keeps the other metrics when followers need a user token", async () => {
    await creator("a");
    await creator("b");
    const { twitch, calls } = fakeHelix(
      { a: { followers: 5, clips: [7], labels: [] }, b: { followers: 5, clips: [3], labels: ["ProfanityVulgarity"] } },
      { followersStatus: 401 },
    );
    const res = await collectTwitchMetrics(db!, twitch, { now });

    expect(res).toMatchObject({ done: 2, followers: "unavailable" });
    const rows = await db!.creator.findMany({ orderBy: { id: "asc" } });
    expect(rows.map((r) => [r.followers, r.clips30d, r.contentLabels])).toEqual([[null, 1, []], [null, 1, ["ProfanityVulgarity"]]]);
    // Gives up on followers after the first refusal instead of asking for every creator.
    expect(calls.filter((c) => c === "/channels/followers").length).toBeLessThanOrEqual(2 * 4);
  });
});
