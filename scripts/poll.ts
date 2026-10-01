import { createDb } from "../src/db";
import { intEnv } from "../src/env";
import { runPoll } from "../src/poll";
import { TwitchClient } from "../src/twitch/client";

const db = createDb();
try {
  const summary = await runPoll(db, TwitchClient.fromEnv(), {
    floor: intEnv("VIEWER_FLOOR", 20),
    trackDays: intEnv("TRACK_DAYS", 30),
  });
  console.log(JSON.stringify(summary));
} finally {
  await db.$disconnect();
}
