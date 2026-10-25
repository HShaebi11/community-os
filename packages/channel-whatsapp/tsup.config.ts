import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // Adapter contract types + the optional Baileys client stay external —
  // resolved via peer deps (baileys is optional in peerDependenciesMeta).
  external: ["@community-os/sdk", "@whiskeysockets/baileys"],
  platform: "node",
  target: "node20",
});
