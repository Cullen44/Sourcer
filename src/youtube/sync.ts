import type { Db } from "../db";
import { matchYoutubeTitle } from "../config/games";
import { DISCOVERY } from "../config/youtube";
import { parseDuration, type VideoItem, type YouTubeClient } from "./client";
import { computeMetrics, type ChannelMetrics } from "./vetting";

const CHUNK = 10;

/**
 * Fetch channel stats and recent uploads, store them, and return each
 * channel's metrics. Works in chunks of 10 (~15 units) and writes as it goes,
 * so running out of budget mid-way keeps everything fetched so far.
 */
export async function syncChannels(
  db: Db,
  yt: YouTubeClient,
  channelIds: string[],
  now = new Date(),
): Promise<Map<string, ChannelMetrics>> {
  const out = new Map<string, ChannelMetrics>();
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);

  for (let i = 0; i < channelIds.length; i += CHUNK) {
    const chunk = channelIds.slice(i, i + CHUNK);
    const channels = await yt.channels(chunk);

    const uploadIds = new Map<string, string[]>();
    for (const c of channels) {
      const playlist = c.contentDetails?.relatedPlaylists?.uploads;
      uploadIds.set(c.id, playlist ? await yt.recentUploadIds(playlist, DISCOVERY.recentUploads) : []);
    }
    const videos = await yt.videos([...uploadIds.values()].flat());
    const byChannel = new Map<string, VideoItem[]>();
    for (const v of videos) byChannel.set(v.snippet.channelId, [...(byChannel.get(v.snippet.channelId) ?? []), v]);

    // Channels the API no longer returns (deleted, terminated, private).
    const missing = chunk.filter((id) => !channels.some((c) => c.id === id));
    if (missing.length) {
      await db.youtubeChannel.updateMany({
        where: { channelId: { in: missing } },
        data: { status: "rejected", rejectReason: "channel unavailable", vettedAt: now },
      });
    }

    for (const c of channels) {
      const vids = byChannel.get(c.id) ?? [];
      const metrics = computeMetrics(
        vids.map((v) => ({
          title: v.snippet.title,
          tags: v.snippet.tags,
          publishedAt: new Date(v.snippet.publishedAt),
          viewCount: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
          likeCount: v.statistics?.likeCount ? Number(v.statistics.likeCount) : null,
          commentCount: v.statistics?.commentCount ? Number(v.statistics.commentCount) : null,
          durationSeconds: parseDuration(v.contentDetails?.duration),
        })),
        now,
      );
      out.set(c.id, metrics);

      await db.$transaction([
        db.youtubeChannel.update({
          where: { channelId: c.id },
          data: {
            title: c.snippet.title,
            handle: c.snippet.customUrl ?? null,
            country: c.snippet.country ?? null,
            subscriberCount: toBigInt(c.statistics?.subscriberCount),
            totalViews: toBigInt(c.statistics?.viewCount),
            videoCount: c.statistics?.videoCount ? Number(c.statistics.videoCount) : null,
            uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? null,
            primaryTitle: metrics.primaryTitle,
            titleShare: metrics.titleShare,
            medianViews: metrics.medianViews,
            engagementRate: metrics.engagementRate,
            uploads30d: metrics.uploads30d,
            lastUploadAt: metrics.lastUploadAt,
            fetchedAt: now,
          },
        }),
        ...vids.map((v) =>
          db.youtubeVideo.upsert({
            where: { videoId: v.id },
            create: {
              videoId: v.id,
              channelId: c.id,
              title: v.snippet.title,
              description: v.snippet.description?.slice(0, 5000) ?? null,
              publishedAt: new Date(v.snippet.publishedAt),
              viewCount: toBigInt(v.statistics?.viewCount),
              likeCount: toBigInt(v.statistics?.likeCount),
              commentCount: toBigInt(v.statistics?.commentCount),
              durationSeconds: parseDuration(v.contentDetails?.duration),
              canonicalTitle: matchYoutubeTitle(`${v.snippet.title} ${(v.snippet.tags ?? []).join(" ")}`),
              fetchedAt: now,
            },
            update: {
              viewCount: toBigInt(v.statistics?.viewCount),
              likeCount: toBigInt(v.statistics?.likeCount),
              commentCount: toBigInt(v.statistics?.commentCount),
              title: v.snippet.title,
              fetchedAt: now,
            },
          }),
        ),
        db.youtubeChannelDaily.upsert({
          where: { channelId_date: { channelId: c.id, date: today } },
          create: {
            channelId: c.id,
            date: today,
            subscriberCount: toBigInt(c.statistics?.subscriberCount),
            medianViews: metrics.medianViews,
            engagementRate: metrics.engagementRate,
            uploads30d: metrics.uploads30d,
          },
          update: {
            subscriberCount: toBigInt(c.statistics?.subscriberCount),
            medianViews: metrics.medianViews,
            engagementRate: metrics.engagementRate,
            uploads30d: metrics.uploads30d,
          },
        }),
      ]);
    }
  }
  return out;
}

function toBigInt(s: string | undefined): bigint | null {
  return s ? BigInt(s) : null;
}
