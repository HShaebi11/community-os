import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      exclude: ["**/dist/**", "**/*.config.*"],

      thresholds: { lines: 93, branches: 68, functions: 96, statements: 93 },
    },
  },
});
