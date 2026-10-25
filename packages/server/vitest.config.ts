import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      // Seeded at measured actuals minus ~5%; ratchet upward as suites grow.
      thresholds: { lines: 78, branches: 80, functions: 79, statements: 78 },
    },
  },
});
