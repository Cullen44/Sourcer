import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations go through the direct (non-pooled) connection. Read env lazily
// so `prisma generate` works in CI where no database is configured.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL },
});
