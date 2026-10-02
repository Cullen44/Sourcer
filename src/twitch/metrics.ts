import type { Db } from "../db";
import { HelixError, type TwitchClient } from "./client";

const DAY = 86_400_000;
/** Clip pages read per creator (100 clips each). Most creators fit in one. */
const CLIP_PAGES = 5;
/** Creators fetched at once. The client paces itself to the rate limit. */
const CONCURRENCY = 4;

interface HelixChannel {
  broadcaster_id: string;
  content_classification_labels: string[];
  is_branded_content: boolean;
}

interface HelixClip {
  id: string;
  view_count: number;
}

export interface MetricsOptions {
  now?: Date;
  /** Creators seen on a target title within this many days get metrics. */
  activeDays?: number;
}

/**
 * Daily audience metrics for Twitch creators: follower count, clips made in
 * the last 30 days (and their views), content classification labels and the
 * branded-content flag. Once per creator per day: creators already done today
 * are skipped, so a re-run only picks up the rest.
 *
 * Requests: 1 per 100 creators for channel info, then ~2 per creator
 * (followers, clips).
 */
export async function collectTwitchMetrics(db: Db, twitch: TwitchClient, opts: MetricsOptions = {}) {
  const now = opts.now ?? new Date();
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const creators = await db.creator.findMany({
    where: {
      lastSeenAt: { gte: new Date(now.getTime() - (opts.activeDays ?? 30) * DAY) },
      OR: [{ metricsAt: null }, { metricsAt: { lt: today } }],
    },
    select: { id: true, twitchUserId: true },
    orderBy: { metricsAt: { sort: "asc", nulls: "first" } },
  });

  const channels = new Map<string, HelixChannel>();
  for (let i = 0; i < creators.length; i += 100) {
    const page = await twitch.get<HelixChannel>("/channels", {
      broadcaster_id: creators.slice(i, i + 100).map((c) => c.twitchUserId),
    });
    for (const ch of page.data) channels.set(ch.broadcaster_id, ch);
  }

  const startedAt = new Date(now.getTime() - 30 * DAY).toISOString();
  let followersAvailable = true;
  let done = 0;
  let gone = 0;

  async function one({ id, twitchUserId }: { id: number; twitchUserId: string }) {
    const channel = channels.get(twitchUserId);
    if (!channel) {
      // Banned or deleted: record the attempt so it isn't retried today.
      await db.creator.update({ where: { id }, data: { metricsAt: now } });
      gone++;
      return;
    }

    let followers: number | null = null;
    if (followersAvailable) {
      try {
        const page = await twitch.get("/channels/followers", { broadcaster_id: twitchUserId, first: "1" });
        followers = page.total ?? null;
      } catch (err) {
        // Twitch may require a user token for this endpoint; keep the other metrics.
        if (err instanceof HelixError && (err.status === 401 || err.status === 403)) {
          if (followersAvailable) console.warn(`followers unavailable: ${err.message}`);
          followersAvailable = false;
        } else throw err;
      }
    }

    let clips = 0;
    let clipViews = 0;
    let cursor: string | undefined;
    for (let p = 0; p < CLIP_PAGES; p++) {
      const page = await twitch.get<HelixClip>("/clips", {
        broadcaster_id: twitchUserId,
        started_at: startedAt,
        ended_at: now.toISOString(),
        first: "100",
        ...(cursor ? { after: cursor } : {}),
      });
      clips += page.data.length;
      clipViews += page.data.reduce((n, clip) => n + clip.view_count, 0);
      cursor = page.data.length ? page.pagination?.cursor : undefined;
      if (!cursor) break;
    }

    await db.$transaction([
      db.creator.update({
        where: { id },
        data: {
          ...(followers !== null ? { followers } : {}),
          clips30d: clips,
          clipViews30d: clipViews,
          contentLabels: channel.content_classification_labels ?? [],
          brandedContent: channel.is_branded_content ?? null,
          metricsAt: now,
        },
      }),
      db.creatorTwitchDaily.upsert({
        where: { creatorId_date: { creatorId: id, date: today } },
        create: { creatorId: id, date: today, followers, clips30d: clips, clipViews30d: clipViews },
        update: { ...(followers !== null ? { followers } : {}), clips30d: clips, clipViews30d: clipViews },
      }),
    ]);
    done++;
  }

  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < creators.length) await one(creators[next++]!);
    }),
  );
  return { creators: creators.length, done, gone, followers: followersAvailable ? "ok" : "unavailable", requests: twitch.requests };
}
