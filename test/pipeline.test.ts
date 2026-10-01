import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db";
import { runPoll } from "../src/poll";
import { runRollup } from "../src/rollup";
import type { HelixStream, TwitchClient } from "../src/twitch/client";

// Runs against a real Postgres with migrations applied. Skipped when
// TEST_DATABASE_URL is not set. The database is wiped between tests.
const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : null;

function s(id: string, user: string, game: string, viewers: number, title = "ranked grind"): HelixStream {
  return {
    id, user_id: user, user_login: user, user_name: user.toUpperCase(), game_id: game,
    game_name: game === "t8" ? "Tekken 8" : "Just Chatting", type: "live", title, viewer_count: viewers,
    started_at: "2026-09-20T18:00:00Z", language: "en", thumbnail_url: "",
  };
}

/** Fake Twitch returning a scripted set of live streams for each sweep. */
function fakeTwitch(live: HelixStream[]): TwitchClient {
  return {
    requests: 0,
    async streamsForGame(gameId: string, floor: number) {
      return live.filter((x) => x.game_id === gameId && x.viewer_count >= floor);
    },
    async streamsForUsers(ids: string[]) {
      return live.filter((x) => ids.includes(x.user_id));
    },
  } as unknown as TwitchClient;
}

const at = (iso: string) => new Date(iso);

describe.skipIf(!db)("poll + rollup", () => {
  beforeEach(async () => {
    await db!.$executeRawUnsafe(`
      TRUNCATE creator_daily, stream_observations, poll_runs, creator_scores, sponsor_mentions,
               youtube_videos, youtube_channels, creators, games, competitor_ads, competitors
      RESTART IDENTITY CASCADE`);
    await db!.game.create({ data: { twitchGameId: "t8", name: "Tekken 8", canonicalTitle: "Tekken", isTarget: true } });
  });
  afterAll(async () => db?.$disconnect());

  it("records target streams above the floor and follows known creators off-target", async () => {
    const opts = { floor: 20, trackDays: 30 };
    // Sweep 1: alice on Tekken (found), bob below floor (ignored).
    await runPoll(db!, fakeTwitch([s("1", "alice", "t8", 300), s("2", "bob", "t8", 5)]), { ...opts, now: at("2026-09-21T20:00:00Z") });
    // Sweep 2: alice moved to Just Chatting. Still observed, so relevance can be computed.
    const r2 = await runPoll(db!, fakeTwitch([s("3", "alice", "jc", 150)]), { ...opts, now: at("2026-09-21T20:20:00Z") });

    expect(r2.observations).toBe(1);
    const creators = await db!.creator.findMany();
    expect(creators.map((c) => c.login)).toEqual(["alice"]);
    // lastSeenAt tracks target-title sightings only.
    expect(creators[0]!.lastSeenAt.toISOString()).toBe("2026-09-21T20:00:00.000Z");
    const jc = await db!.game.findUnique({ where: { twitchGameId: "jc" } });
    expect(jc?.isTarget).toBe(false);
  });

  it("rolls up per creator/game/day with gap-credited hours, then applies retention", async () => {
    const opts = { floor: 20, trackDays: 30 };
    const live = [s("1", "alice", "t8", 100)];
    // Three sweeps 20 min apart, then a 2-hour gap (missed runs), then one more.
    for (const t of ["20:00", "20:20", "20:40", "22:40"]) {
      await runPoll(db!, fakeTwitch(live.map((x) => ({ ...x, viewer_count: t === "20:40" ? 400 : 100 }))), {
        ...opts, now: at(`2026-09-21T${t}:00Z`),
      });
    }
    // An old sweep that should be deleted by retention.
    await runPoll(db!, fakeTwitch(live), { ...opts, now: at("2026-09-10T12:00:00Z") });

    const res = await runRollup(db!, { pollIntervalMinutes: 20, now: at("2026-09-22T03:00:00Z") });

    const daily = await db!.creatorDaily.findMany({ include: { game: true } });
    expect(daily).toHaveLength(1);
    const d = daily[0]!;
    expect(d.date.toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(d.peakCcv).toBe(400);
    expect(d.avgCcv).toBe(175);
    expect(d.sessions).toBe(1);
    // 20m + 20m + capped 40m (gap was 2h) + 20m for the latest sweep = 1h40m
    expect(d.hoursStreamed).toBeCloseTo(100 / 60, 5);

    expect(res.deletedObservations).toBe(1);
    expect(await db!.streamObservation.count()).toBe(4);

    // Idempotent: a second run changes nothing.
    await runRollup(db!, { pollIntervalMinutes: 20, now: at("2026-09-22T03:00:00Z") });
    expect(await db!.creatorDaily.count()).toBe(1);
  });
});
