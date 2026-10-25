#!/usr/bin/env node
// Publishes every publishable workspace whose current version isn't on npm
// yet. Idempotent — safe to re-run; versions already live are skipped.
//
// Flow: bump version in a package's package.json → tag `v*` → push → this
// runs in release.yml and publishes anything new.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PUBLISHABLE = [
  "packages/sdk",
  "packages/whatsapp-import",
  "packages/store-sqlite",
  "packages/channel-discord",
  "packages/channel-slack",
  "packages/channel-whatsapp",
];

const run = (cmd, opts = {}) => execSync(cmd, { encoding: "utf8", stdio: opts.silent ? "pipe" : "inherit", ...opts }).trim();

let published = 0;
for (const dir of PUBLISHABLE) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  if (pkg.private) continue;
  const spec = `${pkg.name}@${pkg.version}`;
  let exists = false;
  try {
    exists = Boolean(run(`npm view ${spec} version`, { silent: true }));
  } catch {
    exists = false; // 404 — not published yet
  }
  if (exists) {
    console.log(`skip  ${spec} (already published)`);
    continue;
  }
  console.log(`publish ${spec}`);
  execSync("npm publish --access public --provenance", { cwd: dir, stdio: "inherit" });
  published++;
}
console.log(`done — ${published} package(s) published`);
