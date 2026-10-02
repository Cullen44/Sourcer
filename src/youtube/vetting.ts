import { matchYoutubeTitle } from "../config/games";
import { DISCOVERY } from "../config/youtube";

export interface UploadFacts {
  title: string;
  tags?: string[];
  publishedAt: Date;
  viewCount: number | null;
  /** Null when hidden (likes) or turned off (comments). */
  likeCount?: number | null;
  commentCount?: number | null;
  durationSeconds: number | null;
}

export interface ChannelMetrics {
  uploads: number;
  titleShare: number;
  primaryTitle: string | null;
  medianViews: number | null;
  /** Median (likes + comments) / views per upload, over the same uploads as medianViews. */
  engagementRate: number | null;
  uploads30d: number;
  lastUploadAt: Date | null;
}

const DAY = 86_400_000;

/** Facts about a channel's recent uploads. Pure; no I/O. */
export function computeMetrics(uploads: UploadFacts[], now: Date): ChannelMetrics {
  const titles = uploads.map((u) => matchYoutubeTitle(`${u.title} ${(u.tags ?? []).join(" ")}`));
  const matched = titles.filter((t): t is string => t !== null);
  const counts = new Map<string, number>();
  for (const t of matched) counts.set(t, (counts.get(t) ?? 0) + 1);
  const primaryTitle = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Fresh uploads haven't collected their views yet; Shorts inflate and distort.
  // Prefer long-form uploads older than 2 days when there are enough of them.
  const settled = uploads.filter((u) => now.getTime() - u.publishedAt.getTime() > 2 * DAY && u.viewCount !== null);
  const longForm = settled.filter((u) => (u.durationSeconds ?? 0) > 180);
  const basis = longForm.length >= 5 ? longForm : settled;

  return {
    uploads: uploads.length,
    titleShare: uploads.length ? matched.length / uploads.length : 0,
    primaryTitle,
    medianViews: median(basis.map((u) => u.viewCount!)),
    engagementRate: engagement(basis),
    uploads30d: uploads.filter((u) => now.getTime() - u.publishedAt.getTime() <= 30 * DAY).length,
    lastUploadAt: uploads.length ? new Date(Math.max(...uploads.map((u) => u.publishedAt.getTime()))) : null,
  };
}

/** Whether a discovered channel passes the funnel; the reason when it doesn't. */
export function vet(m: ChannelMetrics, cfg: typeof DISCOVERY = DISCOVERY): { ok: true } | { ok: false; reason: string } {
  if (m.uploads === 0) return { ok: false, reason: "no uploads" };
  if (m.titleShare < cfg.minTitleShare) {
    return { ok: false, reason: `off-topic: ${Math.round(m.titleShare * 100)}% of recent uploads on target titles` };
  }
  if (m.uploads30d < cfg.minUploads30d) return { ok: false, reason: `inactive: ${m.uploads30d} uploads in 30 days` };
  if (m.medianViews === null) return { ok: false, reason: "no settled uploads to measure" };
  if (m.medianViews < cfg.minMedianViews) return { ok: false, reason: `too small: median ${fmt(m.medianViews)} views` };
  if (m.medianViews > cfg.maxMedianViews) return { ok: false, reason: `too large: median ${fmt(m.medianViews)} views` };
  return { ok: true };
}

/**
 * Median per-upload engagement. A median, not a pooled ratio, so one viral
 * upload doesn't set the rate. Uploads with hidden likes are left out.
 */
function engagement(uploads: UploadFacts[]): number | null {
  const rates = uploads
    .filter((u) => u.likeCount !== null && u.likeCount !== undefined && u.viewCount)
    .map((u) => (u.likeCount! + (u.commentCount ?? 0)) / u.viewCount!)
    .sort((a, b) => a - b);
  if (rates.length === 0) return null;
  const mid = Math.floor(rates.length / 2);
  return rates.length % 2 ? rates[mid]! : (rates[mid - 1]! + rates[mid]!) / 2;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2);
}

const fmt = (n: number) => n.toLocaleString("en-US");
