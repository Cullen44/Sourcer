import { mkdirSync, writeFileSync } from "node:fs";
import { createDb } from "../src/db";
import { changesToMarkdown, getChanges } from "../src/report/changes";

// Write the sponsor-watch changes for the last N days (default 7) to
// exports/ as Markdown. exports/ is git-ignored: this is research, and the
// repo is public.
const days = Number(process.argv[2]) || 7;
const db = createDb();
try {
  const md = changesToMarkdown(await getChanges(db, days));
  mkdirSync("exports", { recursive: true });
  const file = `exports/sponsor-watch-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(file, md);
  console.log(`Wrote ${file}`);
} finally {
  await db.$disconnect();
}
