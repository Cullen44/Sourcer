import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { requireEnv } from "./env.js";

export type Db = PrismaClient;

export function createDb(connectionString = requireEnv("DATABASE_URL")): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
