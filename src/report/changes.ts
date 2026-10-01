import { groupAds } from "../ads/group";
import type { Db } from "../db";

/**
 * What changed in the sponsor watch over a window: new and stopped ads, new
 * codes, newly seen creators carrying a competitor, and new landing domains.
 * Used by the viewer's Changes page and the Markdown report script.
 */
export async function getChanges(db: Db, days = 7, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const competitors = await db.competitor.findMany({ orderBy: [{ priority: "asc" }, { name: "asc" }] });

  const out = [];
  for (const c of competitors) {
    const [active, newAds, stoppedAds, newCodes, mentions, lastRuns, domainsBefore] = await Promise.all([
      db.competitorAd.count({ where: { competitorId: c.id, isActive: true } }),
      db.competitorAd.findMany({ where: { competitorId: c.id, firstObservedAt: { gte: since } }, orderBy: { startedAt: "desc" } }),
      db.competitorAd.findMany({ where: { competitorId: c.id, stoppedAt: { gte: since } }, orderBy: { stoppedAt: "desc" } }),
      db.promoCode.findMany({ where: { competitorId: c.id, firstSeenAt: { gte: since } }, orderBy: { firstSeenAt: "asc" } }),
      db.sponsorMention.findMany({ where: { competitorId: c.id, observedAt: { gte: since } }, orderBy: { viewCount: "desc" } }),
      db.adCollectionRun.findMany({ where: { competitorId: c.id }, orderBy: { startedAt: "desc" }, take: c.fbPageIds.length || 1 }),
      db.competitorAd.findMany({ where: { competitorId: c.id, firstObservedAt: { lt: since } }, distinct: ["landingDomain"], select: { landingDomain: true } }),
    ]);

    // A creator counts as new if this is the first window they were seen carrying this competitor.
    const channelsBefore = new Set(
      (await db.sponsorMention.findMany({
        where: { competitorId: c.id, observedAt: { lt: since } },
        distinct: ["externalChannelId"],
        select: { externalChannelId: true },
      })).map((m) => m.externalChannelId),
    );
    const newCreators = new Map<string, (typeof mentions)[number]>();
    for (const m of mentions) if (!channelsBefore.has(m.externalChannelId) && !newCreators.has(m.externalChannelId)) newCreators.set(m.externalChannelId, m);

    const known = new Set(domainsBefore.map((d) => d.landingDomain));
    const newDomains = [...new Set(newAds.map((a) => a.landingDomain).filter((d): d is string => !!d && !known.has(d)))];

    const reported = lastRuns.some((r) => r.reportedCount !== null) ? lastRuns.reduce((n, r) => n + (r.reportedCount ?? 0), 0) : null;
    const complete = lastRuns.length > 0 && lastRuns.every((r) => r.complete);
    out.push({ competitor: c, active, reported, complete, newAds, newAdGroups: groupAds(newAds), stoppedAds, newCodes, newCreators: [...newCreators.values()], newDomains, lastRuns });
  }
  return { since, now, days, competitors: out };
}

export type Changes = Awaited<ReturnType<typeof getChanges>>;

/** Markdown version of the changes, for pasting into a conversation or a doc. */
export function changesToMarkdown(ch: Changes): string {
  const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "?");
  const lines = [`# Sponsor watch: ${d(ch.since)} to ${d(ch.now)}`, ""];
  for (const c of ch.competitors) {
    const nothing = !c.newAds.length && !c.stoppedAds.length && !c.newCodes.length && !c.newCreators.length;
    lines.push(`## ${c.competitor.name}`, "");
    const seen = c.reported !== null && !c.complete ? `${c.active} of ~${c.reported} active ads seen (Meta shows the first ~30)` : `${c.active} active ads`;
    const stops = c.complete ? `${c.stoppedAds.length} stopped` : "stops not tracked";
    lines.push(`${seen} · ${c.newAds.length} new · ${stops} · ${c.newCodes.length} new codes · ${c.newCreators.length} new creators`, "");
    if (nothing) {
      lines.push("No changes.", "");
      continue;
    }
    if (c.newDomains.length) lines.push(`**New landing domains:** ${c.newDomains.join(", ")}`, "");
    if (c.newCodes.length) lines.push(`**New codes:** ${c.newCodes.map((x) => `\`${x.code}\` (${x.source})`).join(", ")}`, "");
    if (c.newAdGroups.length) {
      lines.push(`**New ads** (${c.newAds.length} ads, ${c.newAdGroups.length} distinct)`, "");
      for (const g of c.newAdGroups.slice(0, 15)) {
        const a = g.ad;
        const variants = g.variants.length > 1 ? ` · ×${g.variants.length} variants` : "";
        lines.push(`- ${d(g.lastStarted)} · ${a.landingDomain ?? "no link"}${a.promoCode ? ` · code ${a.promoCode}` : ""}${variants}: ${[a.headline, a.creativeText].filter(Boolean).join(" / ").replace(/\s+/g, " ").slice(0, 180)}`);
      }
      if (c.newAdGroups.length > 15) lines.push(`- …and ${c.newAdGroups.length - 15} more`);
      lines.push("");
    }
    if (c.stoppedAds.length) lines.push(`**Stopped:** ${c.stoppedAds.length} ads (ran since ${d(c.stoppedAds.at(-1)?.startedAt)})`, "");
    if (c.newCreators.length) {
      lines.push("**Creators newly seen carrying them**", "");
      for (const m of c.newCreators.slice(0, 20)) {
        lines.push(`- ${m.channelTitle ?? m.externalChannelId} (${m.platform}${m.viewCount ? `, ${Number(m.viewCount).toLocaleString("en-US")} views` : ""})${m.promoCode ? ` · code ${m.promoCode}` : ""}: ${m.url}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
