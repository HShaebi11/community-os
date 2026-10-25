import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: { resolve: ["@community-os/core"] },
  clean: true,
  // Bundle the transcript parser + fflate — zero runtime deps, like the sdk.
  noExternal: ["@community-os/core", "fflate"],
  platform: "node",
  target: "node20",
});
