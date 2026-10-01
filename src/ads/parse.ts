/**
 * Parsing Meta Ad Library data. The page's HTML layout is obfuscated and
 * changes often, but the data behind it is JSON: embedded in the initial HTML
 * (<script type="application/json">) and returned by GraphQL calls as the page
 * scrolls. Ads are the objects carrying an `ad_archive_id`; everything here
 * reads them defensively, since Meta does not document this format.
 */

export interface ParsedAd {
  adArchiveId: string;
  pageId: string | null;
  pageName: string | null;
  isActive: boolean;
  startedAt: Date | null;
  endedAt: Date | null;
  platforms: string[];
  body: string | null;
  headline: string | null;
  ctaText: string | null;
  landingUrl: string | null;
  landingDomain: string | null;
  displayFormat: string | null;
  /** How many near-identical ads Meta grouped under this one (1 if none). */
  collationCount: number;
  /** All text in the ad (body, headline, carousel cards), for code extraction. */
  allText: string;
}

/** JSON documents in an HTML page or a GraphQL response body. */
export function extractJsonDocs(text: string): unknown[] {
  const docs: unknown[] = [];
  const tryParse = (s: string) => {
    const t = s.trim().replace(/^for \(;;\);/, "");
    if (!t || (t[0] !== "{" && t[0] !== "[")) return;
    try {
      docs.push(JSON.parse(t));
    } catch {
      /* not JSON; ignore */
    }
  };
  // HTML pages start with markup; GraphQL bodies start with JSON or "for (;;);".
  // (Checking for "<script" anywhere would misfire on JSON that embeds markup.)
  if (/^\s*</.test(text)) {
    for (const m of text.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) tryParse(m[1]!);
  } else {
    // GraphQL responses may stream several JSON documents, one per line.
    tryParse(text) ;
    if (docs.length === 0) for (const line of text.split("\n")) tryParse(line);
  }
  return docs;
}

/** Every object with an ad_archive_id, anywhere in the documents. */
export function findAdObjects(docs: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const stack: unknown[] = [...docs];
  let visited = 0;
  while (stack.length && visited < 2_000_000) {
    const node = stack.pop();
    visited++;
    if (Array.isArray(node)) stack.push(...node);
    else if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      if ("ad_archive_id" in o && o.ad_archive_id) out.push(o);
      for (const v of Object.values(o)) if (v && typeof v === "object") stack.push(v);
    }
  }
  return out;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return str(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
}

/** Dynamic-creative ads carry template placeholders instead of real copy. */
const isTemplate = (s: string | null) => !!s && /\{\{[^}]+\}\}/.test(s);

function textOf(body: unknown): string | null {
  if (typeof body === "string") return str(body);
  if (body && typeof body === "object") {
    const b = body as { text?: unknown; markup?: { __html?: unknown } };
    return str(b.text) ?? stripHtml(str(b.markup?.__html));
  }
  return null;
}

/** Facebook wraps outbound links (l.facebook.com/l.php?u=...); unwrap them. */
export function unwrapLink(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname === "/l.php" && u.searchParams.get("u")) {
      return u.searchParams.get("u");
    }
    return url;
  } catch {
    return null;
  }
}

export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function parseAd(o: Record<string, unknown>): ParsedAd {
  const snap = (o.snapshot && typeof o.snapshot === "object" ? o.snapshot : {}) as Record<string, unknown>;
  const cards = (Array.isArray(snap.cards) ? snap.cards : []) as Record<string, unknown>[];
  const card = cards[0] ?? {};

  let body = textOf(snap.body);
  if (!body || isTemplate(body)) body = textOf(card.body) ?? body;
  let headline = str(snap.title);
  if (!headline || isTemplate(headline)) headline = str(card.title) ?? headline;
  const landingUrl = unwrapLink(str(snap.link_url) ?? str(card.link_url));

  const seconds = (v: unknown) => (typeof v === "number" && v > 0 ? new Date(v * 1000) : null);
  const platforms = (o.publisher_platform ?? o.publisher_platforms ?? []) as unknown;

  const allText = [
    textOf(snap.body), str(snap.title), str(snap.link_description), str(snap.caption),
    ...cards.flatMap((c) => [textOf(c.body), str(c.title), str(c.link_description)]),
  ].filter((t): t is string => !!t && !isTemplate(t)).join("\n");

  return {
    adArchiveId: String(o.ad_archive_id),
    pageId: str(String(o.page_id ?? snap.page_id ?? "")),
    pageName: str(o.page_name) ?? str(snap.page_name),
    isActive: o.is_active === undefined ? true : Boolean(o.is_active),
    startedAt: seconds(o.start_date),
    endedAt: seconds(o.end_date),
    platforms: Array.isArray(platforms) ? platforms.map((p) => String(p).toLowerCase()) : [],
    body,
    headline,
    ctaText: str(snap.cta_text) ?? str(card.cta_text),
    landingUrl,
    landingDomain: domainOf(landingUrl),
    displayFormat: str(snap.display_format),
    collationCount: typeof o.collation_count === "number" && o.collation_count > 0 ? o.collation_count : 1,
    allText,
  };
}

/**
 * All distinct ads in a set of HTML/GraphQL bodies. When the same ad appears
 * more than once, the copy with the most text wins.
 */
export function parseAds(bodies: string[]): ParsedAd[] {
  const byId = new Map<string, ParsedAd>();
  for (const body of bodies) {
    for (const obj of findAdObjects(extractJsonDocs(body))) {
      const ad = parseAd(obj);
      const prev = byId.get(ad.adArchiveId);
      if (!prev || ad.allText.length > prev.allText.length) byId.set(ad.adArchiveId, ad);
    }
  }
  return [...byId.values()];
}

/** Field names seen on ad objects, for the diagnostic log (no ad content). */
export function describeShape(bodies: string[]): { adObjects: number; topKeys: string[]; snapshotKeys: string[] } {
  const objs = bodies.flatMap((b) => findAdObjects(extractJsonDocs(b)));
  const top = new Set<string>();
  const snap = new Set<string>();
  for (const o of objs.slice(0, 20)) {
    Object.keys(o).forEach((k) => top.add(k));
    if (o.snapshot && typeof o.snapshot === "object") Object.keys(o.snapshot).forEach((k) => snap.add(k));
  }
  return { adObjects: objs.length, topKeys: [...top].sort(), snapshotKeys: [...snap].sort() };
}

/** The "~1,200 results" count the Ad Library shows for a search, if present. */
export function reportedResultCount(pageText: string): number | null {
  const m = /~?\s*([\d,.]+)\s*(K)?\s+results?\b/i.exec(pageText);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(m[2] ? n * 1000 : n);
}
