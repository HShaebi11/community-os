import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      exclude: ["*.config.*", "src/*.test.ts", "drizzle/", "src/index.ts"],
      thresholds: { lines: 80, branches: 75, functions: 80, statements: 80 },
    },
  },
});
