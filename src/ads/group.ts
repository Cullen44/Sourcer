/**
 * Meta's dynamic creative and A/B testing produce many ads with identical
 * copy under different ad IDs. Grouping them shows how many distinct messages
 * a competitor runs; the variant count shows how hard each one is pushed.
 */
export interface GroupableAd {
  id: number;
  adLibraryId: string;
  competitorId: number;
  headline: string | null;
  creativeText: string | null;
  ctaText: string | null;
  landingDomain: string | null;
  startedAt: Date | null;
  isActive: boolean;
  platforms: string[];
}

export interface AdGroup<T extends GroupableAd> {
  /** The most recently started variant, shown as the group's face. */
  ad: T;
  variants: T[];
  firstStarted: Date | null;
  lastStarted: Date | null;
  activeVariants: number;
  platforms: string[];
}

const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export function adGroupKey(a: GroupableAd): string {
  return [a.competitorId, norm(a.headline), norm(a.creativeText), norm(a.ctaText), a.landingDomain ?? ""].join("|");
}

/** Group identical ads, keeping the input order of each group's first appearance. */
export function groupAds<T extends GroupableAd>(ads: T[]): AdGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const a of ads) {
    const key = adGroupKey(a);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups.values()].map((variants) => {
    const starts = variants.map((v) => v.startedAt?.getTime()).filter((t): t is number => t !== undefined);
    const newest = [...variants].sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0))[0]!;
    return {
      ad: newest,
      variants,
      firstStarted: starts.length ? new Date(Math.min(...starts)) : null,
      lastStarted: starts.length ? new Date(Math.max(...starts)) : null,
      activeVariants: variants.filter((v) => v.isActive).length,
      platforms: [...new Set(variants.flatMap((v) => v.platforms))].sort(),
    };
  });
}
