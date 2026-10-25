import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: { resolve: true },
  clean: true,
  // Bundle the kernel + parser so the published package is fully
  // self-contained: `npm i @community-os/sdk` gets remote client AND the
  // in-process embedded mode with no other installs.
  noExternal: ["@community-os/core", "@community-os/whatsapp-import"],
  target: "node20",
});
