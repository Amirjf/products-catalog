import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      ADMIN_TOKEN: "test-token",
      DATABASE_URL: "postgres://catalog:catalog@localhost:5433/catalog_test",
    },
    // Test files share catalog_test and truncate it, so they run one at a time.
    fileParallelism: false,
  },
});
