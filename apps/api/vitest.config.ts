import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      // This app is a deployment wrapper — logic lives in @community-os/*.
      // Excluded: package config files, worker/node process entries (they bind
      // ports/runtimes). src/app.ts (the Hono wiring) stays measured.
      exclude: ["**/dist/**", "**/*.config.*", "**/.cloudflare/**", "src/index.ts", "src/node.ts"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
