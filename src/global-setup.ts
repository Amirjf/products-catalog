import type { TestProject } from "vitest/node";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

export default async function setup({ config }: TestProject) {
  const url = config.env.DATABASE_URL ?? "";
  if (!url.endsWith("/catalog_test")) {
    throw new Error(
      `Tests drop the schema of DATABASE_URL, so it must name the catalog_test database. Got ${url}`,
    );
  }

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query("SELECT 1").catch(() => {
      try {
        execFileSync("docker", ["compose", "up", "--detach", "--wait", "db"], {
          stdio: "inherit",
        });
      } catch (cause) {
        throw new Error(
          `Postgres at ${url} is unreachable and "docker compose up --detach --wait db" failed. Start the database, then rerun the tests.`,
          { cause },
        );
      }
    });
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
