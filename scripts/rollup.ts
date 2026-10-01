import { createDb } from "../src/db.js";
import { intEnv } from "../src/env.js";
import { runRollup } from "../src/rollup.js";

const db = createDb();
try {
  const summary = await runRollup(db, { pollIntervalMinutes: intEnv("POLL_INTERVAL_MINUTES", 20) });
  console.log(JSON.stringify(summary));
} finally {
  await db.$disconnect();
}
