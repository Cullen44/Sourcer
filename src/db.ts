import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { requireEnv } from "./env";

export type Db = PrismaClient;

export function createDb(connectionString = requireEnv("DATABASE_URL")): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
