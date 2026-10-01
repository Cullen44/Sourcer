import type { Db } from "../db";
import type { TwitchClient } from "./client";

interface HelixUser {
  id: string;
  login: string;
  display_name: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
}

/**
 * Fill in profile details (bio, partner/affiliate status, avatar) for creators
 * not yet enriched. 100 users per request; Twitch-side only, no YouTube quota.
 */
export async function enrichCreators(db: Db, twitch: TwitchClient, now = new Date(), limit = 5000) {
  const pending = await db.creator.findMany({
    where: { enrichedAt: null },
    select: { twitchUserId: true },
    take: limit,
  });
  let enriched = 0;
  for (let i = 0; i < pending.length; i += 100) {
    const ids = pending.slice(i, i + 100).map((p) => p.twitchUserId);
    const page = await twitch.get<HelixUser>("/users", { id: ids });
    for (const u of page.data) {
      await db.creator.update({
        where: { twitchUserId: u.id },
        data: {
          login: u.login,
          displayName: u.display_name,
          broadcasterType: u.broadcaster_type || null,
          description: u.description || null,
          profileImageUrl: u.profile_image_url || null,
          enrichedAt: now,
        },
      });
      enriched++;
    }
    // Accounts that no longer exist come back absent; mark them so they aren't retried.
    const returned = new Set(page.data.map((u) => u.id));
    const gone = ids.filter((id) => !returned.has(id));
    if (gone.length) await db.creator.updateMany({ where: { twitchUserId: { in: gone } }, data: { enrichedAt: now } });
  }
  return { enriched };
}
