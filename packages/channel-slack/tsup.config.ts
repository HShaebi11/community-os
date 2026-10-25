import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // Adapter contract types stay external — resolved via the sdk peer dep.
  external: ["@community-os/sdk"],
  platform: "node",
  target: "node20",
});
