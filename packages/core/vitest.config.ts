import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/.stryker-tmp/**", "**/node_modules/**"],
    coverage: {
      // index.ts is a re-export barrel; store.ts/types.ts are type-only — no runtime code.
      exclude: ["**/dist/**", "**/*.config.*", "src/index.ts", "src/store.ts", "src/types.ts"],

      thresholds: { lines: 96, branches: 90, functions: 98, statements: 96 },
    },
  },
});
