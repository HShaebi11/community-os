import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      exclude: ["**/dist/**", "**/*.config.*"],

      thresholds: { lines: 96, branches: 84, functions: 89, statements: 96 },
    },
  },
});
