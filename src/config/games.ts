/**
 * The seven target titles. Several ship yearly Twitch categories, so each
 * canonical title is resolved via category search and filtered by a pattern.
 * Curation is manual: run `npm run games:seed -- --dry-run` after a new yearly
 * release and widen a pattern if the new entry is missing.
 */
export interface TargetTitle {
  canonicalTitle: string;
  searchQuery: string;
  include: RegExp;
}

export const TARGET_TITLES: TargetTitle[] = [
  {
    canonicalTitle: "Call of Duty",
    searchQuery: "Call of Duty",
    include: /^Call of Duty(: (Warzone|Black Ops (6|7)|Modern Warfare (III|4|IV)))?$/i,
  },
  { canonicalTitle: "NBA 2K", searchQuery: "NBA 2K", include: /^NBA 2K2[5-9]$/i },
  { canonicalTitle: "EA FC", searchQuery: "EA Sports FC", include: /^EA Sports FC 2[5-9]$/i },
  { canonicalTitle: "Madden", searchQuery: "Madden NFL", include: /^Madden NFL 2[5-9]$/i },
  { canonicalTitle: "Counter-Strike", searchQuery: "Counter-Strike", include: /^Counter-Strike( 2)?$/i },
  { canonicalTitle: "Tekken", searchQuery: "Tekken", include: /^Tekken 8$/i },
  { canonicalTitle: "Street Fighter", searchQuery: "Street Fighter", include: /^Street Fighter 6$/i },
];
