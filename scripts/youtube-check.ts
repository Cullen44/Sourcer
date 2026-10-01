import { YouTubeClient } from "../src/youtube/client.js";

// Smoke test for the YouTube key: one cheap channel lookup, then one real
// promo-code search as a preview of the sponsor watch. Costs ~102 units.
const yt = YouTubeClient.fromEnv();

const [channel] = await yt.channels(["UC_x5XG1OV2P6uZZ5FSM9Ttw"]); // Google for Developers
if (!channel) throw new Error("Key works but the channel lookup returned nothing");
console.log(`Key OK: channels.list returned "${channel.snippet.title}"`);

const query = process.env.CHECK_QUERY || '"Kalshi" promo code';
const since = new Date(Date.now() - 30 * 86_400_000);
const results = await yt.search(query, { publishedAfter: since, maxResults: 15 });
const videos = await yt.videos(results.flatMap((r) => (r.id.videoId ? [r.id.videoId] : [])));

console.log(`\nSearch ${query}, last 30 days: ${videos.length} videos`);
for (const v of videos) {
  const views = Number(v.statistics?.viewCount ?? 0).toLocaleString("en-US");
  console.log(`- ${v.snippet.publishedAt.slice(0, 10)}  ${views.padStart(10)} views  ${v.snippet.channelTitle} — ${v.snippet.title}`);
}
console.log(`\nQuota used: ${yt.unitsUsed} of 10,000 daily units`);
