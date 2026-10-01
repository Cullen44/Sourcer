import type { Db } from "../db";
import { extractCodes } from "../sponsors/codes";
import type { PageResult } from "./collect";

/**
 * Record one Page's collection. Ads seen are upserted (first/last observed);
 * codes in ad copy are added to promo_codes so the YouTube search picks them
 * up. Only after an "ok" run are this Page's previously active ads that were
 * not seen marked stopped, so a blocked or broken scrape can't fake a mass stop.
 */
export async function storeResult(
  db: Db,
  competitor: { id: number; codes: string[] },
  pageId: string,
  result: PageResult,
  startedAt: Date,
  now = new Date(),
) {
  await db.adCollectionRun.create({
    data: {
      competitorId: competitor.id, pageId, startedAt, finishedAt: now,
      status: result.status, adsFound: result.ads.length, detail: result.detail,
    },
  });

  let newAds = 0;
  const newCodes = new Set<string>();
  for (const ad of result.ads) {
    const known = competitor.codes.filter((c) => new RegExp(`\\b${c.replace(/[^A-Za-z0-9]/g, "")}\\b`, "i").test(ad.allText));
    const codes = [...new Set([...extractCodes(ad.allText).map((c) => c.code), ...known])];
    const data = {
      pageId: ad.pageId ?? pageId,
      pageName: ad.pageName,
      creativeText: ad.body?.slice(0, 5000) ?? null,
      headline: ad.headline,
      ctaText: ad.ctaText,
      landingUrl: ad.landingUrl,
      landingDomain: ad.landingDomain,
      promoCode: codes[0] ?? null,
      displayFormat: ad.displayFormat,
      platforms: ad.platforms,
      startedAt: ad.startedAt,
    };
    const existing = await db.competitorAd.findUnique({ where: { adLibraryId: ad.adArchiveId }, select: { id: true } });
    if (!existing) newAds++;
    await db.competitorAd.upsert({
      where: { adLibraryId: ad.adArchiveId },
      create: { adLibraryId: ad.adArchiveId, competitorId: competitor.id, firstObservedAt: now, lastObservedAt: now, isActive: true, ...data },
      update: { ...data, lastObservedAt: now, isActive: true, stoppedAt: null },
    });
    if (codes.length) {
      const added = await db.promoCode.createMany({
        data: codes.map((code) => ({ competitorId: competitor.id, code, source: "ad", firstSeenAt: now })),
        skipDuplicates: true,
      });
      if (added.count) codes.forEach((c) => newCodes.add(c));
    }
  }

  let stopped = 0;
  if (result.status === "ok") {
    const r = await db.competitorAd.updateMany({
      where: { competitorId: competitor.id, pageId, isActive: true, lastObservedAt: { lt: startedAt } },
      data: { isActive: false, stoppedAt: now },
    });
    stopped = r.count;
  }
  return { newAds, stopped, newCodes: [...newCodes] };
}
