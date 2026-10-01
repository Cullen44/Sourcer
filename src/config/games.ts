/**
 * The seven target titles. Several ship yearly Twitch categories, so each
 * canonical title is resolved via category search and filtered by a pattern.
 * Curation is manual: run `npm run games:seed -- --dry-run` after a new yearly
 * release and widen a pattern if the new entry is missing.
 *
 * `youtube` decides whether a YouTube video (title + tags) is about the title,
 * and `youtubeQuery` is what discovery searches for.
 */
export interface TargetTitle {
  canonicalTitle: string;
  searchQuery: string;
  include: RegExp;
  youtube: RegExp;
  youtubeQuery: string;
}

export const TARGET_TITLES: TargetTitle[] = [
  {
    canonicalTitle: "Call of Duty",
    searchQuery: "Call of Duty",
    include: /^Call of Duty(: (Warzone|Black Ops (6|7)|Modern Warfare (III|4|IV)))?$/i,
    youtube: /\b(call of duty|warzone|black ?ops ?(6|7)|bo[67]|modern warfare ?(iii|3|4|iv)|mw[34])\b/i,
    youtubeQuery: "Black Ops 7 | Warzone",
  },
  {
    canonicalTitle: "NBA 2K",
    searchQuery: "NBA 2K",
    include: /^NBA 2K2[5-9]$/i,
    youtube: /\b(nba ?2k(2[5-9])?|2k2[5-9])\b/i,
    youtubeQuery: "NBA 2K27",
  },
  {
    canonicalTitle: "EA FC",
    searchQuery: "EA Sports FC",
    include: /^EA Sports FC 2[5-9]$/i,
    youtube: /\b(ea (sports )?fc ?(2[5-9])?|fc ?2[5-9]|fut ?(champs|draft)?)\b/i,
    youtubeQuery: "EA FC 27 | FC 27 Ultimate Team",
  },
  {
    canonicalTitle: "Madden",
    searchQuery: "Madden NFL",
    include: /^Madden NFL 2[5-9]$/i,
    youtube: /\b(madden( nfl)?( 2[5-9])?|madden ultimate team)\b/i,
    youtubeQuery: "Madden 27",
  },
  {
    canonicalTitle: "Counter-Strike",
    searchQuery: "Counter-Strike",
    include: /^Counter-Strike( 2)?$/i,
    youtube: /\b(counter[- ]?strike( 2)?|cs ?2|cs:?go)\b/i,
    youtubeQuery: "Counter-Strike 2 | CS2",
  },
  {
    canonicalTitle: "Tekken",
    searchQuery: "Tekken",
    include: /^Tekken 8$/i,
    youtube: /\btekken( ?8)?\b/i,
    youtubeQuery: "Tekken 8",
  },
  {
    canonicalTitle: "Street Fighter",
    searchQuery: "Street Fighter",
    include: /^Street Fighter 6$/i,
    youtube: /\b(street fighter( 6)?|sf6)\b/i,
    youtubeQuery: "Street Fighter 6",
  },
];

/** The canonical title a piece of YouTube text is about, or null. */
export function matchYoutubeTitle(text: string): string | null {
  for (const t of TARGET_TITLES) if (t.youtube.test(text)) return t.canonicalTitle;
  return null;
}
