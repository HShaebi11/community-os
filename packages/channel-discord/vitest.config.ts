import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      exclude: ["**/dist/**", "**/*.config.*"],

      thresholds: { lines: 92, branches: 80, functions: 96, statements: 92 },
    },
  },
});
