import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "community-os-api",
    compatibilityDate: "2026-10-22",
    entrypoint,
    observability: {
      enabled: true,
      traces: { enabled: true },
    },
    env: {
      DATABASE_URL: bindings.secret(),
      BETTER_AUTH_SECRET: bindings.secret(),
    },
  },
});
