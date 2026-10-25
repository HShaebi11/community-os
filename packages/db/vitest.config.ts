import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      exclude: ["**/dist/**", "**/*.config.*", "src/*.test.ts", "drizzle/", "src/index.ts"],

      thresholds: { lines: 100, branches: 100, functions: 78, statements: 100 },
    },
  },
});
