import { TARGET_TITLES } from "../src/config/games.js";
import { createDb } from "../src/db.js";
import { TwitchClient } from "../src/twitch/client.js";

// Resolve the target titles to Twitch category IDs. Re-run after a new yearly
// release (CoD, EA FC, 2K, Madden). `--dry-run` prints matches without writing.
const dryRun = process.argv.includes("--dry-run");
const twitch = TwitchClient.fromEnv();
const db = dryRun ? null : createDb();

try {
  for (const t of TARGET_TITLES) {
    const results = await twitch.searchCategories(t.searchQuery);
    const matched = results.filter((g) => t.include.test(g.name));
    const skipped = results.filter((g) => !t.include.test(g.name)).map((g) => g.name);
    console.log(`\n${t.canonicalTitle}: ${matched.length ? matched.map((g) => `${g.name} (${g.id})`).join(", ") : "NO MATCH"}`);
    if (skipped.length) console.log(`  not matched: ${skipped.slice(0, 15).join(" | ")}`);
    for (const g of matched) {
      await db?.game.upsert({
        where: { twitchGameId: g.id },
        create: { twitchGameId: g.id, name: g.name, canonicalTitle: t.canonicalTitle, isTarget: true },
        update: { name: g.name, canonicalTitle: t.canonicalTitle, isTarget: true },
      });
    }
  }
} finally {
  await db?.$disconnect();
}
