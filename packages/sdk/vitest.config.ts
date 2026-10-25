import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      // types.ts and drift-check.ts are compile-time-only (drift-check exists
      //       // so tsc fails if public wire types drift from core) — no runtime code.
      exclude: ["**/dist/**", "**/*.config.*", "src/types.ts", "src/drift-check.ts"],

      thresholds: { lines: 93, branches: 87, functions: 96, statements: 93 },
    },
  },
});
