/**
 * YouTube budgets and discovery filters. The daily quota is 10,000 units and
 * resets at midnight Pacific; search costs 100 units, everything else 1.
 * Edit these to tune; nothing else needs to change.
 */

/** Unit caps per stage of the nightly job. Leaves ~2,000 for manual checks. */
export const YOUTUBE_BUDGET = {
  /** Resolve YouTube links from Twitch creators' bios. */
  twitchLinks: 300,
  /** Search competitor names and promo codes (~20 searches). */
  promoSearch: 2_000,
  /** Title searches for new channels: one uploads + one live search per title. */
  discoverySearch: 1_400,
  /** Vet new candidates (~2 units per channel). */
  vetting: 1_500,
  /** Refresh tracked channels' recent uploads (~2 units per channel). */
  refresh: 1_500,
  /** Hard ceiling across all stages for one quota day. */
  dailyCeiling: 8_000,
} as const;

/** Discovery is a funnel: only channels passing all of these get tracked. */
export const DISCOVERY = {
  /** Uploads considered when vetting a channel. */
  recentUploads: 20,
  /** At least this share of recent uploads must be about target titles. */
  minTitleShare: 0.5,
  /** Uploads in the last 30 days. */
  minUploads30d: 4,
  /** Median views of recent uploads (older than 2 days, long-form preferred). */
  minMedianViews: 1_000,
  maxMedianViews: 250_000,
  /** Admission caps so tracking can never flood. */
  maxNewPerDay: 25,
  maxTracked: 400,
  /** A rejected channel is re-checked only if it shows up again after this long. */
  revetAfterDays: 30,
  /** Search scope. */
  regionCode: "US",
  relevanceLanguage: "en",
  publishedWithinDays: 3,
} as const;

/** Promo-code search scope. */
export const PROMO_SEARCH = {
  publishedWithinDays: 30,
  maxResults: 25,
} as const;
