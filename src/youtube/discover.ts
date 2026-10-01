import type { Db } from "../db";
import { TARGET_TITLES } from "../config/games";
import { DISCOVERY } from "../config/youtube";
import type { YouTubeClient } from "./client";
import { syncChannels } from "./sync";
import { vet } from "./vetting";

const DAY = 86_400_000;

/**
 * Stage 1: one recent-uploads search and one live search per target title.
 * Every channel that appears becomes a candidate; nothing is tracked yet.
 * Rejected channels are only re-opened if they reappear after revetAfterDays.
 */
export async function searchCandidates(db: Db, yt: YouTubeClient, now = new Date()) {
  let searches = 0;
  let newCandidates = 0;
  let reopened = 0;
  const publishedAfter = new Date(now.getTime() - DISCOVERY.publishedWithinDays * DAY);

  for (const t of TARGET_TITLES) {
    for (const live of [false, true]) {
      const items = await yt.search(t.youtubeQuery, {
        live,
        publishedAfter: live ? undefined : publishedAfter,
        order: live ? "viewCount" : "relevance",
        maxResults: 50,
        gamingOnly: true,
        regionCode: DISCOVERY.regionCode,
        relevanceLanguage: DISCOVERY.relevanceLanguage,
      });
      searches++;

      const seen = new Map(items.map((i) => [i.snippet.channelId, i.snippet.channelTitle]));
      const ids = [...seen.keys()];
      const existing = await db.youtubeChannel.findMany({ where: { channelId: { in: ids } } });
      const known = new Set(existing.map((e) => e.channelId));

      const created = await db.youtubeChannel.createMany({
        data: ids.filter((id) => !known.has(id)).map((id) => ({
          channelId: id,
          title: seen.get(id),
          source: "discovery",
          status: "candidate",
          lastSeenInSearch: now,
        })),
        skipDuplicates: true,
      });
      newCandidates += created.count;

      await db.youtubeChannel.updateMany({ where: { channelId: { in: [...known] } }, data: { lastSeenInSearch: now } });
      const revetBefore = new Date(now.getTime() - DISCOVERY.revetAfterDays * DAY);
      const r = await db.youtubeChannel.updateMany({
        where: { channelId: { in: [...known] }, status: "rejected", vettedAt: { lt: revetBefore }, NOT: { rejectReason: "channel unavailable" } },
        data: { status: "candidate" },
      });
      reopened += r.count;
    }
  }
  return { searches, newCandidates, reopened };
}

/**
 * Stage 2: vet candidates, most recently seen first, until today's admission
 * slots or the budget run out. Passing channels are tracked; failing ones are
 * rejected with a reason. If no slots are left, nothing is vetted (no spend).
 */
export async function vetCandidates(db: Db, yt: YouTubeClient, now = new Date()) {
  const startOfDay = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const [tracked, admittedToday] = await Promise.all([
    db.youtubeChannel.count({ where: { status: "tracked", source: { not: "twitch_link" } } }),
    db.youtubeChannel.count({ where: { status: "tracked", source: { not: "twitch_link" }, vettedAt: { gte: startOfDay } } }),
  ]);
  let slots = Math.min(DISCOVERY.maxNewPerDay - admittedToday, DISCOVERY.maxTracked - tracked);
  let admitted = 0;
  let rejected = 0;

  while (slots > 0) {
    const batch = await db.youtubeChannel.findMany({
      where: { status: "candidate" },
      orderBy: [{ lastSeenInSearch: { sort: "desc", nulls: "last" } }, { id: "asc" }],
      take: 10,
      select: { channelId: true },
    });
    if (batch.length === 0) break;

    const metrics = await syncChannels(db, yt, batch.map((b) => b.channelId), now);
    for (const [channelId, m] of metrics) {
      const decision = vet(m);
      if (decision.ok && slots > 0) {
        slots--;
        admitted++;
        await db.youtubeChannel.update({ where: { channelId }, data: { status: "tracked", rejectReason: null, vettedAt: now } });
      } else if (!decision.ok) {
        rejected++;
        await db.youtubeChannel.update({ where: { channelId }, data: { status: "rejected", rejectReason: decision.reason, vettedAt: now } });
      }
      // Passed but no slot left: stays a candidate for tomorrow.
    }
  }
  return { admitted, rejected, slotsLeft: slots };
}

/**
 * Stage 3: refresh tracked channels, least recently fetched first, so the
 * daily snapshots build a time series. Tracked channels are not re-vetted
 * (no churn); they are dropped only if the channel disappears.
 */
export async function refreshTracked(db: Db, yt: YouTubeClient, now = new Date()) {
  const startOfDay = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  let refreshed = 0;
  for (;;) {
    const batch = await db.youtubeChannel.findMany({
      where: { status: "tracked", fetchedAt: { lt: startOfDay } },
      orderBy: { fetchedAt: "asc" },
      take: 10,
      select: { channelId: true },
    });
    if (batch.length === 0) break;
    await syncChannels(db, yt, batch.map((b) => b.channelId), now);
    refreshed += batch.length;
  }
  return { refreshed };
}
