import type { Db } from "./db.js";
import type { HelixStream, TwitchClient } from "./twitch/client.js";

export interface PollOptions {
  /** Minimum concurrent viewers for a stream to enter via the per-game sweep. */
  floor: number;
  /** Keep following creators seen on a target title within this many days. */
  trackDays: number;
  now?: Date;
}

export interface PollSummary {
  pollRunId: number;
  targetStreams: number;
  trackedStreams: number;
  observations: number;
  newCreators: number;
  requests: number;
}

/**
 * One sweep:
 *  1. Live streams on every target game ID, down to the viewer floor.
 *  2. Live streams of creators already being tracked, in any category and at
 *     any viewer count. Without this, relevance (share of streaming on target
 *     titles) is uncomputable, because a target-only sweep never sees the rest.
 * Each stream becomes one stream_observations row tied to this poll run.
 */
export async function runPoll(db: Db, twitch: TwitchClient, opts: PollOptions): Promise<PollSummary> {
  const now = opts.now ?? new Date();
  const run = await db.pollRun.create({ data: { startedAt: now } });
  const requestsBefore = twitch.requests;

  try {
    const targets = await db.game.findMany({ where: { isTarget: true } });
    if (targets.length === 0) throw new Error("No target games found. Run `npm run games:seed` first.");
    const targetIds = new Set(targets.map((g) => g.twitchGameId));

    const targetStreams: HelixStream[] = [];
    for (const g of targets) targetStreams.push(...(await twitch.streamsForGame(g.twitchGameId, opts.floor)));

    const since = new Date(now.getTime() - opts.trackDays * 86_400_000);
    const tracked = await db.creator.findMany({
      where: { lastSeenAt: { gte: since } },
      select: { twitchUserId: true },
    });
    const trackedStreams = await twitch.streamsForUsers(tracked.map((c) => c.twitchUserId));

    // Dedupe: a tracked creator on a target title shows up in both sweeps.
    const streams = new Map<string, HelixStream>();
    for (const s of [...targetStreams, ...trackedStreams]) if (s.game_id) streams.set(s.id, s);
    const all = [...streams.values()];

    // Off-target categories get a row so observations can reference them.
    await db.game.createMany({
      data: uniqueBy(all, (s) => s.game_id).map((s) => ({ twitchGameId: s.game_id, name: s.game_name })),
      skipDuplicates: true,
    });

    const created = await db.creator.createMany({
      data: uniqueBy(targetStreams, (s) => s.user_id).map((s) => ({
        twitchUserId: s.user_id,
        login: s.user_login,
        displayName: s.user_name,
        firstSeenAt: now,
        lastSeenAt: now,
      })),
      skipDuplicates: true,
    });
    // lastSeenAt means "last seen on a target title"; it decides who stays tracked.
    const onTarget = uniqueBy(all.filter((s) => targetIds.has(s.game_id)), (s) => s.user_id);
    await db.creator.updateMany({
      where: { twitchUserId: { in: onTarget.map((s) => s.user_id) } },
      data: { lastSeenAt: now },
    });

    const [creators, games] = await Promise.all([
      db.creator.findMany({
        where: { twitchUserId: { in: uniqueBy(all, (s) => s.user_id).map((s) => s.user_id) } },
        select: { id: true, twitchUserId: true },
      }),
      db.game.findMany({
        where: { twitchGameId: { in: uniqueBy(all, (s) => s.game_id).map((s) => s.game_id) } },
        select: { id: true, twitchGameId: true },
      }),
    ]);
    const creatorId = new Map(creators.map((c) => [c.twitchUserId, c.id]));
    const gameId = new Map(games.map((g) => [g.twitchGameId, g.id]));

    const rows = all.flatMap((s) => {
      const cid = creatorId.get(s.user_id);
      const gid = gameId.get(s.game_id);
      if (cid === undefined || gid === undefined) return [];
      return [{
        pollRunId: run.id,
        creatorId: cid,
        gameId: gid,
        streamId: s.id,
        viewerCount: s.viewer_count,
        title: s.title,
        language: s.language,
        startedAt: new Date(s.started_at),
        observedAt: now,
      }];
    });
    await db.streamObservation.createMany({ data: rows, skipDuplicates: true });

    const requests = twitch.requests - requestsBefore;
    await db.pollRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), streamsSeen: rows.length, requests },
    });

    return {
      pollRunId: run.id,
      targetStreams: targetStreams.length,
      trackedStreams: trackedStreams.length,
      observations: rows.length,
      newCreators: created.count,
      requests,
    };
  } catch (err) {
    await db.pollRun.update({
      where: { id: run.id },
      data: { error: String(err instanceof Error ? err.stack ?? err.message : err).slice(0, 4000) },
    });
    throw err;
  }
}

function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(key(item))) seen.set(key(item), item);
  return [...seen.values()];
}
