import { COMPETITORS } from "../src/config/competitors";
import { createDb } from "../src/db";

// Upsert the watch list. Never clears a page ID or code already in the
// database; codes discovered later by the pipeline are kept.
const db = createDb();
try {
  for (const c of COMPETITORS) {
    const existing = await db.competitor.findUnique({ where: { name: c.name } });
    const knownCodes = [...new Set([...(existing?.knownCodes ?? []), ...c.knownCodes])];
    const domains = [...new Set([...(existing?.domains ?? []), ...c.domains])];
    const row = await db.competitor.upsert({
      where: { name: c.name },
      create: { ...c, knownCodes, domains },
      update: { priority: c.priority, knownCodes, domains, ...(c.fbPageId ? { fbPageId: c.fbPageId } : {}) },
    });
    await db.promoCode.createMany({
      data: c.knownCodes.map((code) => ({ competitorId: row.id, code, source: "seed" })),
      skipDuplicates: true,
    });
  }
  console.log(`Seeded ${COMPETITORS.length} competitors`);
} finally {
  await db.$disconnect();
}
