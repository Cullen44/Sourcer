import type { Db } from "../db";

/** The YouTube quota day (it resets at midnight Pacific), as YYYY-MM-DD. */
export function quotaDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

export async function unitsUsedToday(db: Db, now = new Date()): Promise<number> {
  const row = await db.youtubeUsage.findUnique({ where: { date: new Date(`${quotaDay(now)}T00:00:00Z`) } });
  return row?.units ?? 0;
}

export async function recordUnits(db: Db, units: number, now = new Date()): Promise<void> {
  if (units <= 0) return;
  const date = new Date(`${quotaDay(now)}T00:00:00Z`);
  await db.youtubeUsage.upsert({
    where: { date },
    create: { date, units },
    update: { units: { increment: units } },
  });
}
