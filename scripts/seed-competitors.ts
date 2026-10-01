import { COMPETITORS } from "../src/config/competitors";
import { createDb } from "../src/db";

// Upsert the watch list. Never removes a Page ID, domain or code already in
// the database; values added later (by hand or by the pipeline) are kept.
const db = createDb();
try {
  for (const c of COMPETITORS) {
    const existing = await db.competitor.findUnique({ where: { name: c.name } });
    const knownCodes = [...new Set([...(existing?.knownCodes ?? []), ...c.knownCodes])];
    const domains = [...new Set([...(existing?.domains ?? []), ...c.domains])];
    const fbPageIds = [...new Set([...(existing?.fbPageIds ?? []), ...c.fbPageIds])];
    const row = await db.competitor.upsert({
      where: { name: c.name },
      create: { ...c, knownCodes, domains, fbPageIds },
      update: { priority: c.priority, knownCodes, domains, fbPageIds },
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
