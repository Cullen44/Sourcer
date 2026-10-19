/**
 * What makes a creator a fit for BobaCharge: they host or teach short-term
 * rentals (the core requirement), and ideally cover or own electric vehicles
 * (a bonus, not required). Edit the patterns and queries here to retarget.
 */

/**
 * Short-term rental content. Matched against a video's title and tags only:
 * many real-estate channels mention Airbnb in every description's boilerplate,
 * which would make every upload look on-topic.
 */
export const STR_PATTERN =
  /\b(air ?bnb|vrbo|short[- ]term rentals?|vacation rentals?|mid[- ]term rentals?|super ?host|co-?host(s|ing)?|rental arbitrage|guesty|hospitable|pricelabs|hostaway|turno|str (host|investing|business|market|income|property|properties))\b|\bSTRs?\b/i;

/**
 * Electric vehicles and charging. Matched against title, tags and description,
 * so a creator who lists their Tesla in the description counts as EV-adjacent.
 */
export const EV_PATTERN =
  /\b(evs?|electric (vehicle|car|truck|suv)s?|tesla|model [3ysx]|cybertruck|rivian|lucid air|ioniq ?[56]?|mach-?e|f-?150 lightning|bolt euv|polestar|kia ev[369]|level ?2 charg(er|ing)|ev charg(er|ers|ing)|home charg(er|ing)|super ?charg(er|ers|ing)|chargepoint|wallbox|evmatch|boba ?charge)\b/i;

export const TOPICS = { STR: "Short-term rentals", EV: "EVs" } as const;
export type Topic = keyof typeof TOPICS;

/** Topics a video covers. */
export function videoTopics(v: { title: string; tags?: string[]; description?: string | null }): Topic[] {
  const head = `${v.title} ${(v.tags ?? []).join(" ")}`;
  const out: Topic[] = [];
  if (STR_PATTERN.test(head)) out.push("STR");
  if (EV_PATTERN.test(`${head} ${v.description ?? ""}`)) out.push("EV");
  return out;
}

/**
 * Discovery searches, one each per nightly run (100 YouTube units apiece).
 * Mostly host-side STR topics; a few where STR and EVs overlap.
 */
export const DISCOVERY_QUERIES = [
  "airbnb host tips",
  "short term rental investing",
  "airbnb superhost",
  "airbnb cohosting",
  "vrbo host",
  "airbnb amenities guests love",
  "airbnb property setup",
  "short term rental business",
  "airbnb EV charger",
  "EV road trip airbnb",
  "tesla airbnb",
  "EV charger rental property",
];
