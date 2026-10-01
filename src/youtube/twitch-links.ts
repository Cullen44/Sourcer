import type { Db } from "../db";
import type { ChannelItem, YouTubeClient } from "./client";

export type YoutubeRef =
  | { kind: "channel"; id: string }
  | { kind: "handle"; handle: string }
  | { kind: "user"; name: string }
  | { kind: "custom"; name: string };

/** First YouTube channel reference in a piece of text (a Twitch bio), if any. */
export function extractYoutubeRef(text: string | null | undefined): YoutubeRef | null {
  if (!text) return null;
  const m =
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(channel\/(UC[\w-]{22})|@([\w.-]+)|user\/([\w.-]+)|c\/([\w.-]+))/i.exec(text);
  if (m) {
    if (m[2]) return { kind: "channel", id: m[2] };
    if (m[3]) return { kind: "handle", handle: m[3] };
    if (m[4]) return { kind: "user", name: m[4] };
    if (m[5]) return { kind: "custom", name: m[5] };
  }
  // youtu.be links point at videos, not channels; bare "YT: @name" mentions are too ambiguous.
  return null;
}

/**
 * For enriched creators not yet checked, look for a YouTube link in their bio
 * and resolve it to a channel (0-1 units each). Linked channels are tracked
 * without vetting: the creator is already in scope from Twitch.
 * Most streamers keep links in Twitch panels, which the API can't read, so a
 * missing link is not evidence of no YouTube channel.
 */
export async function linkTwitchCreators(db: Db, yt: YouTubeClient, now = new Date()) {
  const pending = await db.creator.findMany({
    where: { enrichedAt: { not: null }, youtubeCheckedAt: null },
    select: { id: true, description: true },
    take: 2000,
  });
  let linked = 0;
  for (const c of pending) {
    const ref = extractYoutubeRef(c.description);
    let channelId: string | null = null;
    if (ref?.kind === "channel") channelId = ref.id;
    else if (ref) {
      let ch: ChannelItem | null = null;
      if (ref.kind === "handle") ch = await yt.channelByHandle(ref.handle);
      else if (ref.kind === "user") ch = await yt.channelByUsername(ref.name);
      else ch = await yt.channelByHandle(ref.name); // legacy /c/ names usually match the handle
      channelId = ch?.id ?? null;
    }

    if (channelId) {
      await db.youtubeChannel.upsert({
        where: { channelId },
        // fetchedAt in the past so today's refresh picks it up.
        create: { channelId, creatorId: c.id, source: "twitch_link", status: "tracked", fetchedAt: new Date(0) },
        update: { creatorId: c.id, source: "twitch_link", status: "tracked", rejectReason: null },
      });
      linked++;
    }
    await db.creator.update({
      where: { id: c.id },
      data: { youtubeCheckedAt: now, ...(channelId ? { youtubeChannelId: channelId } : {}) },
    });
  }
  return { checked: pending.length, linked };
}
