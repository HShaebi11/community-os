# Releasing

Packages publish from CI — no local `npm publish` needed.

## The publishable surface

| Package | What it is |
|---|---|
| `@community-os/sdk` | The product — Community OS as a library (zero runtime deps) |
| `@community-os/whatsapp-import` | WhatsApp `.txt`/`.zip` export parser |
| `@community-os/store-sqlite` | `node:sqlite` Store adapter (durable embedded mode) |
| `@community-os/channel-discord` | Discord Gateway listener |
| `@community-os/channel-slack` | Slack Socket Mode listener + Events API receiver |
| `@community-os/channel-whatsapp` | Baileys listener + Cloud API receiver |

Everything else (`core`, `server`, `db`, `mcp`, the apps) is internal —
the SDK bundles what it needs at build time.

## Cut a release

```bash
# 1. bump "version" in the package(s) you're releasing — semver:
#    patch = fixes, minor = new methods/adapters, major = breaking
# 2. commit, tag, push
git tag v0.2.0 && git push origin main --tags
```

`release.yml` runs: validate → build all six → `publish-if-needed.mjs`,
which publishes every publishable package whose version isn't on npm yet
(skips versions already live — safe to re-run). `--provenance` attaches
build attestations from the workflow's OIDC identity.

## Required repo secrets

| Secret | For | Where to get it |
|---|---|---|
| `NPM_TOKEN` | publishing | npm → Access Tokens → Granular, publish rights on `@community-os/*` (create the org first) |
| `CODECOV_TOKEN` | coverage uploads | codecov.io → repo settings (works without it — reports are also kept as workflow artifacts) |

## Versioning rule of thumb

The SDK's public types are the contract — `drift-check.ts` fails typecheck
if they diverge from core, so a type change anywhere is automatically a
release-worthy event. Bump the SDK's minor version whenever a `/v1` route
or method surface grows, major when a shape changes.
