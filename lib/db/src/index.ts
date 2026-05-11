import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
export { otpTable, usersTable, sessionsTable } from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = postgres(process.env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
