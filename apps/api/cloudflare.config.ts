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
      BETTER_AUTH_URL: bindings.secret(),
      APP_ORIGINS: bindings.secret(),
      RESEND_API_KEY: bindings.secret(),
      EMAIL_FROM: bindings.secret(),
      GOOGLE_CLIENT_ID: bindings.secret(),
      GOOGLE_CLIENT_SECRET: bindings.secret(),
      ALLOW_DEV_AUTH: bindings.secret(),
    },
  },
});
