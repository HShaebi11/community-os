import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      // This app is a deployment wrapper — its logic lives in @community-os/*
      // packages. The files below are glue that can't run under vitest:
      // worker/node entries and the Postgres adapter (needs a live DATABASE_URL;
      // its Store semantics are covered by the shared contract suite instead).
      exclude: ["src/index.ts", "src/node.ts", "src/cloudflare.config.ts", "src/drizzle-store.ts", "src/env.d.ts"],
      thresholds: { lines: 0, branches: 0, functions: 0, statements: 0 },
    },
  },
});
