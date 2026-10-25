import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.stryker-tmp/**"],
    coverage: {
      // Seeded at measured actuals minus ~5%; ratchet upward as suites grow.
      thresholds: { lines: 93, branches: 88, functions: 94, statements: 93 },
    },
  },
});
