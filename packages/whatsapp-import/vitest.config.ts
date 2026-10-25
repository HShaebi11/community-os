import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      // Seeded at measured actuals minus ~5%; ratchet upward as suites grow.
      thresholds: { lines: 89, branches: 75, functions: 95, statements: 89 },
    },
  },
});
