import { createDb } from "../src/db.js";
import { intEnv } from "../src/env.js";
import { runPoll } from "../src/poll.js";
import { TwitchClient } from "../src/twitch/client.js";

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
