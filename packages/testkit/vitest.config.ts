import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      // Test infrastructure — exercised transitively by the consumer suites
      // (core, store-sqlite, db, sdk, server). No product code to gate.
      exclude: ["**/dist/**", "**/*.config.*", "src/**"],
    },
  },
});
