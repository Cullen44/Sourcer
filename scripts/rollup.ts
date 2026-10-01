import { createDb } from "../src/db";
import { intEnv } from "../src/env";
import { runRollup } from "../src/rollup";

const db = createDb();
try {
  const summary = await runRollup(db, { pollIntervalMinutes: intEnv("POLL_INTERVAL_MINUTES", 20) });
  console.log(JSON.stringify(summary));
} finally {
  await db.$disconnect();
}
