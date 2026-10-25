import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      exclude: ["**/dist/**", "**/*.config.*", "src/*.test.ts", "drizzle/", "src/index.ts"],

      thresholds: { lines: 97, branches: 86, functions: 75, statements: 97 },
    },
  },
});
