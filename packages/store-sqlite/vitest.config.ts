import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      // Seeded at measured actuals minus ~5%; ratchet upward as suites grow.
      thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
    },
  },
});
