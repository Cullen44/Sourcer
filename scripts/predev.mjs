// Runs before `npm run dev`: regenerate the Prisma client, and if the schema
// changed since the last dev run, clear Next's on-disk compile cache (.next).
// Otherwise pages compiled against the old client can survive a git pull and
// fail with errors about columns that no longer exist.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

execSync("npx prisma generate", { stdio: "inherit" });

const hash = createHash("sha256").update(readFileSync("prisma/schema.prisma")).digest("hex");
const marker = "src/generated/.schema-hash";
const previous = existsSync(marker) ? readFileSync(marker, "utf8") : null;
if (previous !== hash && existsSync(".next")) {
  console.log("Database schema changed: clearing the .next cache so every page recompiles.");
  rmSync(".next", { recursive: true, force: true });
}
writeFileSync(marker, hash);
