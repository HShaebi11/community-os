/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec ↔ route drift detection (bidirectional) plus a never-500 matrix.
 *
 * Industry pattern: the published contract (docs/openapi.yaml) and the
 * implemented routes must agree in BOTH directions — a route added without
 * docs is an invisible feature; a documented route that doesn't exist is a
 * lie. This test fails on either drift so the two can never silently diverge.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { MemoryStore } from "@community-os/core";
import { createApp } from "./index.ts";

const openapiPath = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/openapi.yaml");
const spec = parse(readFileSync(openapiPath, "utf8")) as { paths: Record<string, Record<string, unknown>> };

const HTTP_METHODS = new Set(["get", "post", "patch", "put", "delete", "head"]);

/** `/v1/members/{memberId}` ⇄ `/v1/members/:memberId` */
const normalize = (p: string) => p.replace(/:(\w+)/g, "{$1}");

function docRoutes(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [path, ops] of Object.entries(spec.paths)) {
    map.set(path, new Set(Object.keys(ops).filter((k) => HTTP_METHODS.has(k))));
  }
  return map;
}

function appRoutes(): Map<string, Set<string>> {
  const app = createApp(new MemoryStore());
  const map = new Map<string, Set<string>>();
  for (const r of app.routes) {
    if (r.path === "*" || r.path === "/*") continue; // app.use middleware, not a route
    // The MCP mount registers ALL handlers on /mcp and /mcp/* — both collapse
    // to the documented `/mcp` entry.
    const path = r.path === "/mcp/*" ? "/mcp" : normalize(r.path);
    const methods = r.method === "ALL" ? ["post"] : [r.method.toLowerCase()];
    for (const m of methods) {
      if (!map.has(path)) map.set(path, new Set());
      map.get(path)!.add(m);
    }
  }
  return map;
}

describe("openapi.yaml ⇄ route drift", () => {
  it("every app route is documented in openapi.yaml", () => {
    const docs = docRoutes();
    const missing: string[] = [];
    for (const [path, methods] of appRoutes()) {
      const docMethods = docs.get(path);
      for (const m of methods) {
        if (!docMethods?.has(m)) missing.push(`${m.toUpperCase()} ${path}`);
      }
    }
    expect(missing, `routes missing from docs/openapi.yaml: ${missing.join(", ")}`).toEqual([]);
  });

  it("every documented route is implemented by the app", () => {
    const routes = appRoutes();
    const missing: string[] = [];
    for (const [path, methods] of docRoutes()) {
      const appMethods = routes.get(path);
      for (const m of methods) {
        if (!appMethods?.has(m)) missing.push(`${m.toUpperCase()} ${path}`);
      }
    }
    expect(missing, `documented routes with no implementation: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("never-500 matrix", () => {
  const app = createApp(new MemoryStore());
  const FAKE = "00000000-0000-4000-8000-000000000000";
  const FAKE_SLUG = "no-such-slug-anywhere";

  // Every documented GET route, params filled with ids that can't exist.
  const getPaths = Object.keys(spec.paths).filter((p) => spec.paths[p].get);

  it.each(getPaths)("GET %s never 500s on a missing resource", async (path) => {
    const url = path.replaceAll("{id}", FAKE).replaceAll("{memberId}", FAKE)
      .replaceAll("{demandId}", FAKE).replaceAll("{proposalId}", FAKE)
      .replaceAll("{eventId}", FAKE).replaceAll("{slug}", FAKE_SLUG);
    const res = await app.request(url.includes("search") ? `${url}?q=x` : url);
    expect(res.status).toBeLessThan(500);
    expect([200, 400, 404]).toContain(res.status);
  });

  const postPaths = Object.keys(spec.paths).filter((p) => spec.paths[p].post && p !== "/mcp");

  it.each(postPaths)("POST %s with {} body never 500s", async (path) => {
    const url = path.replaceAll("{id}", FAKE).replaceAll("{memberId}", FAKE)
      .replaceAll("{demandId}", FAKE).replaceAll("{proposalId}", FAKE)
      .replaceAll("{eventId}", FAKE).replaceAll("{slug}", FAKE_SLUG);
    const res = await app.request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBeLessThan(500);
  });

  it.each(postPaths)("POST %s with a truncated JSON body never 500s", async (path) => {
    const url = path.replaceAll("{id}", FAKE).replaceAll("{memberId}", FAKE)
      .replaceAll("{demandId}", FAKE).replaceAll("{proposalId}", FAKE)
      .replaceAll("{eventId}", FAKE).replaceAll("{slug}", FAKE_SLUG);
    const res = await app.request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"name": "trunc',
    });
    expect(res.status).toBeLessThan(500);
  });
});
