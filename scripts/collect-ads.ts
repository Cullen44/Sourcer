import { chromium } from "playwright";
import { collectPage } from "../src/ads/collect";
import { storeResult } from "../src/ads/store";
import { createDb } from "../src/db";

// Collect each competitor's active US ads from the Meta Ad Library.
// --probe also logs the field names found on ad objects (never ad content;
// this repo's Actions logs are public), to diagnose format changes.
const probe = process.argv.includes("--probe");
// --page=<id> limits the run to one Facebook Page (for diagnosing).
const onlyPage = process.argv.find((a) => a.startsWith("--page="))?.slice(7);
const db = createDb();
const browser = await chromium.launch();
// Any Page that didn't collect cleanly fails the run, so GitHub emails the
// repo owner: blocked, errored, or "empty" while Meta reports ads (which
// means the page format changed and the parser found nothing).
const problems: string[] = [];
let pages = 0;
try {
  const competitors = await db.competitor.findMany({ include: { codes: true }, orderBy: { priority: "asc" } });
  for (const c of competitors) {
    for (const pageId of c.fbPageIds) {
      if (onlyPage && pageId !== onlyPage) continue;
      pages++;
      const startedAt = new Date();
      const result = await collectPage(browser, pageId, probe ? console.log : undefined);
      const stored = await storeResult(db, { id: c.id, codes: c.codes.map((x) => x.code) }, pageId, result, startedAt);
      const genuinelyEmpty = result.status === "empty" && result.reported === 0;
      if (result.status !== "ok" && !genuinelyEmpty) problems.push(`${c.name} (${pageId}): ${result.status}, ${result.detail}`);
      console.log(
        `${c.name} (${pageId}): ${result.status}${result.complete ? ", complete" : `, first page only (no stops recorded)`}, ${result.ads.length} active ads, ${stored.newAds} new, ` +
          `${stored.stopped} stopped, ${stored.newCodes.length} new codes. ${result.detail}`,
      );
      if (probe || result.status !== "ok") console.log(`  shape: ${JSON.stringify(result.shape)}`);
      // Be gentle: a pause between Pages.
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
} finally {
  await browser.close();
  await db.$disconnect();
}
if (problems.length) {
  console.error(`\n${problems.length} of ${pages} Pages failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
