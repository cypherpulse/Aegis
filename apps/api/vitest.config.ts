import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 40000,
    // The API test files share one Postgres and truncate between tests, so they
    // must not run concurrently (a parallel truncate would wipe another file's
    // data). Serialize files against the shared database.
    fileParallelism: false,
  },
});
