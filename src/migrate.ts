// Applies pending migrations. With SEED=true, it then loads the seed data into an
// empty catalog. It runs as a one-off job before the API starts, never inside the
// API process, so several API instances cannot race to migrate.
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readFile } from "node:fs/promises";

import { db, pool } from "./db/client.js";
import { products } from "./db/schema.js";

await migrate(db, { migrationsFolder: "./drizzle" });
if (process.env.SEED === "true" && (await db.$count(products)) === 0) {
  await pool.query(await readFile("./db/seed.sql", "utf8"));
  console.log("Seeded products");
}
await pool.end();
