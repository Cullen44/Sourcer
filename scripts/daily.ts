import { YOUTUBE_BUDGET } from "../src/config/youtube";
import { createDb } from "../src/db";
import { scanTwitchTitles } from "../src/sponsors/twitch-titles";
import { runPromoSearch } from "../src/sponsors/youtube-promo";
import { TwitchClient } from "../src/twitch/client";
import { enrichCreators } from "../src/twitch/enrich";
import { BudgetExceeded, QuotaExhausted, YouTubeClient } from "../src/youtube/client";
import { refreshTracked, searchCandidates, vetCandidates } from "../src/youtube/discover";
import { linkTwitchCreators } from "../src/youtube/twitch-links";
import { recordUnits, unitsUsedToday } from "../src/youtube/usage";

// Nightly enrichment and sponsor watch. Each stage is independent: one failing
// doesn't stop the rest, and each YouTube stage is capped to its share of the
// daily quota. Exits non-zero if any stage failed, so the workflow shows red.
const db = createDb();
const twitch = TwitchClient.fromEnv();
const yt = YouTubeClient.fromEnv();
const failures: string[] = [];
let quotaGone = false;

async function stage(name: string, fn: () => Promise<unknown>) {
  try {
    console.log(`${name}: ${JSON.stringify(await fn())}`);
  } catch (err) {
    failures.push(name);
    console.error(`${name} FAILED:`, err);
  }
}

async function youtubeStage(name: string, cap: number, fn: () => Promise<unknown>) {
  if (quotaGone) return console.log(`${name}: skipped, YouTube quota exhausted`);
  const used = await unitsUsedToday(db);
  yt.allowance = Math.min(cap, YOUTUBE_BUDGET.dailyCeiling - used);
  if (yt.allowance <= 0) return console.log(`${name}: skipped, daily ceiling reached (${used} units used)`);
  const before = yt.unitsUsed;
  try {
    console.log(`${name}: ${JSON.stringify(await fn())}`);
  } catch (err) {
    if (err instanceof BudgetExceeded) console.log(`${name}: stopped at its budget`);
    else if (err instanceof QuotaExhausted) {
      quotaGone = true;
      console.error(`${name}: ${err.message}`);
    } else {
      failures.push(name);
      console.error(`${name} FAILED:`, err);
    }
  } finally {
    const spent = yt.unitsUsed - before;
    await recordUnits(db, spent);
    console.log(`  ${spent} units`);
  }
}

try {
  await stage("twitch-enrich", () => enrichCreators(db, twitch));
  await stage("twitch-title-scan", () => scanTwitchTitles(db));
  await youtubeStage("youtube-twitch-links", YOUTUBE_BUDGET.twitchLinks, () => linkTwitchCreators(db, yt));
  await youtubeStage("youtube-promo-search", YOUTUBE_BUDGET.promoSearch, () => runPromoSearch(db, yt));
  await youtubeStage("youtube-discovery-search", YOUTUBE_BUDGET.discoverySearch, () => searchCandidates(db, yt));
  await youtubeStage("youtube-vetting", YOUTUBE_BUDGET.vetting, () => vetCandidates(db, yt));
  await youtubeStage("youtube-refresh", YOUTUBE_BUDGET.refresh, () => refreshTracked(db, yt));
  console.log(`YouTube units today: ${await unitsUsedToday(db)}`);
} finally {
  await db.$disconnect();
}
if (failures.length) {
  console.error(`Failed stages: ${failures.join(", ")}`);
  process.exit(1);
}
