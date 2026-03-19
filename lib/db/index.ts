import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Returns a Drizzle ORM instance backed by a pg Pool.
 * Uses lazy singleton pattern — the pool and drizzle instance are created
 * on first call and reused thereafter.
 */
export function getDb() {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "[db] DATABASE_URL environment variable is not set. " +
          "Check .env.example for the required format."
      );
    }
    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });
  }
  return db;
}

/**
 * Closes the underlying pg Pool. Call during graceful shutdown.
 */
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
