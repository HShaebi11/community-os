import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      // The report measures everything under src/ so the numbers are honest,
      // while the 100% gate stays scoped to the lib module that has tests —
      // pages and components report their real (untested) coverage without
      // blocking the suite.
      include: ["src/**"],
      exclude: ["**/*.config.*", "**/.next/**", "src/lib/types.ts"],
      thresholds: { "src/lib/**": { lines: 100, branches: 100, functions: 100, statements: 100 } },
    },
  },
});
