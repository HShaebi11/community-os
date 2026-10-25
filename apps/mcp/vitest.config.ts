import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      // src/index.ts is the stdio bootstrap (env + transport wiring, no logic).
      exclude: ["**/dist/**", "**/*.config.*", "src/index.ts"],

      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
