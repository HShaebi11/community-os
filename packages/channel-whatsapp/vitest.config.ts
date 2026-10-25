import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      exclude: ["**/dist/**", "**/*.config.*"],

      thresholds: { lines: 94, branches: 63, functions: 52, statements: 94 },
    },
  },
});
