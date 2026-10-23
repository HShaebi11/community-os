import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destDir = join(root, "apps/api/node_modules/@cloudflare");
const dest = join(destDir, "vite-plugin");
const src = join(root, "node_modules/@cloudflare/vite-plugin");
mkdirSync(destDir, { recursive: true });
rmSync(dest, { recursive: true, force: true });
symlinkSync(src, dest);
