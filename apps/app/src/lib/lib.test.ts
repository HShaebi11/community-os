import { afterEach, describe, expect, it, vi } from "vitest";
import { api, apiBinary } from "./api";
import { fetchPublic } from "./public-api";
import { cn } from "./utils";

const respond = (status: number, body: string, statusText = "") =>
  new Response(body, { status, statusText });

const lastCall = () => vi.mocked(fetch).mock.calls.at(-1)!;

afterEach(() => vi.unstubAllGlobals());

describe("api — request wrapper", () => {
  it("sets content-type: application/json only for string bodies without one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, "{}")));
    await api("/x", { method: "POST", body: "{}" });
    expect(new Headers(lastCall()[1]!.headers).get("content-type")).toBe("application/json");
  });

  it("keeps a caller-provided content-type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, "{}")));
    await api("/x", { method: "POST", body: "{}", headers: { "content-type": "text/plain" } });
    expect(new Headers(lastCall()[1]!.headers).get("content-type")).toBe("text/plain");
  });

  it("does not set json content-type for non-string bodies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, "{}")));
    await api("/x", { method: "POST", body: new FormData() });
    expect(new Headers(lastCall()[1]!.headers).get("content-type")).toBeNull();
  });

  it("does not set content-type on bodyless requests", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, "{}")));
    await api("/x");
    expect(new Headers(lastCall()[1]!.headers).get("content-type")).toBeNull();
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, '{"ok":true,"n":3}')));
    expect(await api<{ ok: boolean; n: number }>("/x")).toEqual({ ok: true, n: 3 });
  });

  it("throws the server's error field on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(422, '{"error":"bad input"}', "Unprocessable")));
    await expect(api("/x")).rejects.toThrow("bad input");
  });

  it("throws the raw body for non-JSON error pages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(502, "<html>proxy down</html>", "Bad Gateway")));
    await expect(api("/x")).rejects.toThrow("<html>proxy down</html>");
  });

  it("falls back to statusText when an error body is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(500, "", "Internal Server Error")));
    await expect(api("/x")).rejects.toThrow("Internal Server Error");
  });
});

describe("apiBinary — upload wrapper", () => {
  it("posts the body with the given content-type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, '{"id":"f1"}')));
    const buf = new ArrayBuffer(4);
    const out = await apiBinary<{ id: string }>("/import", buf, "application/zip");
    const init = lastCall()[1]!;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/zip");
    expect(init.body).toBe(buf);
    expect(out).toEqual({ id: "f1" });
  });

  it("throws the server's error on failure — and survives a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(400, '{"error":"bad zip"}')));
    await expect(apiBinary("/import", new ArrayBuffer(1), "application/zip")).rejects.toThrow("bad zip");
    vi.mocked(fetch).mockResolvedValueOnce(respond(502, "proxy exploded", "Bad Gateway"));
    await expect(apiBinary("/import", new ArrayBuffer(1), "application/zip")).rejects.toThrow("proxy exploded");
    vi.mocked(fetch).mockResolvedValueOnce(respond(500, "", "Internal Server Error"));
    await expect(apiBinary("/import", new ArrayBuffer(1), "application/zip")).rejects.toThrow("Internal Server Error");
  });
});

describe("fetchPublic — public surface client", () => {
  it("sends the public-origin header with no-store caching", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, '{"slug":"x"}')));
    const out = await fetchPublic<{ slug: string }>("/v1/public/e/x");
    const init = lastCall()[1]!;
    expect(String(lastCall()[0])).toContain("/v1/public/e/x");
    expect(new Headers(init.headers).get("x-public-origin")).toBeTruthy();
    expect(init.cache).toBe("no-store");
    expect(out).toEqual({ slug: "x" });
  });

  it("returns null on 404 instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(404, '{"error":"nope"}', "Not Found")));
    expect(await fetchPublic("/v1/public/e/missing")).toBeNull();
  });

  it("throws with the status on other failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(500, "{}", "Internal Server Error")));
    await expect(fetchPublic("/v1/public/e/x")).rejects.toThrow("public api failed: 500");
  });
});

describe("cn — class merge", () => {
  it("merges strings, drops falsy, applies conditions", () => {
    expect(cn("a", "b")).toBe("a b");
    expect(cn("a", false && "no", null, undefined, "b")).toBe("a b");
    expect(cn({ on: true, off: false }, ["x", "y"])).toBe("on x y");
    expect(cn()).toBe("");
  });

  it("resolves tailwind conflicts last-wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    expect(cn("px-2", "p-4")).toBe("p-4");
    // Non-conflicting utilities are preserved.
    expect(cn("p-2", "m-4", "flex")).toBe("p-2 m-4 flex");
  });
});
