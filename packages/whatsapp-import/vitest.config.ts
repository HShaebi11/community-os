import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      exclude: ["**/dist/**", "**/*.config.*"],

      thresholds: { lines: 91, branches: 76, functions: 96, statements: 91 },
    },
  },
});
