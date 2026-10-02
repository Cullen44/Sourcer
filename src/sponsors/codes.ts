/**
 * Finding competitor mentions and promo codes in free text (video titles and
 * descriptions, stream titles). Pure functions; no I/O.
 */

export interface CompetitorRef {
  id: number;
  name: string;
  domains: string[];
  codes: string[];
}

/** Extra spellings people use for each competitor, beyond its name and domains. */
const ALIASES: Record<string, string[]> = {
  PrizePicks: ["prize picks"],
  DraftKings: ["draft kings"],
  FanDuel: ["fan duel"],
};

/**
 * Everyday words that only count as a brand mention next to promo language
 * ("underdog run" is a stream title; "Underdog promo code" is a sponsor).
 */
const WEAK_ALIASES: Record<string, string[]> = {
  "Underdog Fantasy": ["underdog"],
};
const PROMO_CONTEXT = /\b(promo|code|sign ?up|deposit|bonus|referral|sponsor(ed)?|#ad)\b/i;

/**
 * Brand names that are also common phrases ("1v1 me" is gamer talk). They
 * count only next to promo language; their domains always count.
 */
const WEAK_NAMES = new Set(["1v1Me"]);

/** Words that follow "code" in prose but are not codes. */
const NOT_CODES = new Set([
  "BELOW", "ABOVE", "HERE", "LINK", "IN", "AT", "FOR", "AND", "THE", "TO", "ON", "WITH", "IS", "TODAY",
  "NOW", "THIS", "THAT", "MY", "YOUR", "OUR", "GET", "USE", "FREE", "BONUS", "PROMO", "REFERRAL", "SIGNUP",
  "DESCRIPTION", "WORKS", "WORKING", "EXPIRED", "VALID", "OFFER", "DEAL", "AVAILABLE", "LIST", "LISTED",
]);

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termsFor(c: CompetitorRef, text: string): string[] {
  const promo = PROMO_CONTEXT.test(text);
  const weak = promo ? (WEAK_ALIASES[c.name] ?? []) : [];
  const name = WEAK_NAMES.has(c.name) && !promo ? [] : [c.name];
  return [...name, ...c.domains, ...(ALIASES[c.name] ?? []), ...weak];
}

/** Character offsets where each competitor is mentioned. */
export function findCompetitors(text: string, competitors: CompetitorRef[]): Map<number, number[]> {
  const hits = new Map<number, number[]>();
  for (const c of competitors) {
    const re = new RegExp(`\\b(${termsFor(c, text).map(escape).join("|")})\\b`, "gi");
    const at = [...text.matchAll(re)].map((m) => m.index!);
    // A known code counts as a mention even if the brand isn't named.
    for (const code of c.codes) {
      if (code.length < 4 || /^\d+$/.test(code)) continue; // short/numeric codes are too ambiguous alone
      const m = new RegExp(`\\b${escape(code)}\\b`).exec(text);
      if (m) at.push(m.index);
    }
    if (at.length) hits.set(c.id, at);
  }
  return hits;
}

/** Candidate promo codes with their offsets: "code ROYAL", "promo code: SLICE", "use code CHEESEPICKS". */
export function extractCodes(text: string): { code: string; at: number }[] {
  const out: { code: string; at: number }[] = [];
  const re = /\bcode\b\s*(?:is\s*)?[:\-–=]?\s*["“'`*]*([A-Za-z0-9]{3,20})\b/gi;
  for (const m of text.matchAll(re)) {
    const raw = m[1]!;
    const code = raw.toUpperCase();
    // Codes are written in caps or with digits; lowercase words are prose ("code below").
    const looksLikeCode = raw === code || /\d/.test(raw);
    if (!looksLikeCode || NOT_CODES.has(code)) continue;
    out.push({ code, at: m.index! + m[0].lastIndexOf(raw) });
  }
  return out;
}

export interface Finding {
  competitorId: number;
  codes: string[];
}

/**
 * Which competitors a text mentions, and the codes attributed to each.
 * A code goes to the nearest mentioned competitor, so a description that
 * plugs two brands doesn't mix their codes up.
 */
export function analyze(text: string, competitors: CompetitorRef[]): Finding[] {
  const hits = findCompetitors(text, competitors);
  if (hits.size === 0) return [];
  const codes = new Map<number, Set<string>>([...hits.keys()].map((id) => [id, new Set<string>()]));

  // Known codes always count for their own competitor.
  for (const c of competitors) {
    if (!hits.has(c.id)) continue;
    for (const code of c.codes) if (new RegExp(`\\b${escape(code)}\\b`, "i").test(text)) codes.get(c.id)!.add(code);
  }
  for (const { code, at } of extractCodes(text)) {
    let best: number | null = null;
    let dist = Infinity;
    for (const [id, offsets] of hits) {
      for (const o of offsets) {
        if (Math.abs(o - at) < dist) {
          dist = Math.abs(o - at);
          best = id;
        }
      }
    }
    if (best !== null) codes.get(best)!.add(code);
  }
  return [...codes.entries()].map(([competitorId, set]) => ({ competitorId, codes: [...set] }));
}
