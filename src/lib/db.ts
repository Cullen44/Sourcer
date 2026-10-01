import { createDb, type Db } from "../db";

// One client per server process; Next dev reloads modules, so cache on globalThis.
const g = globalThis as unknown as { __sourcerDb?: Db };
export const db: Db = g.__sourcerDb ?? (g.__sourcerDb = createDb());
