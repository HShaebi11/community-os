const apiBase = process.env.API_PROXY_TARGET ?? "http://localhost:5173";
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

export async function fetchPublic<T>(path: string): Promise<T | null> {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { "x-public-origin": site },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`public api failed: ${res.status}`);
  return (await res.json()) as T;
}
