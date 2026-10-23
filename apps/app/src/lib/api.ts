export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\x00-\x1f\x7f]/.test(value)) return null;
  return value;
}

function redirectToSignIn() {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${window.location.search}`;
  if (!window.location.pathname.startsWith("/sign-in")) {
    window.location.href = `/sign-in?next=${encodeURIComponent(next)}`;
  }
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.body && typeof opts.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(path, { ...opts, headers, credentials: "same-origin" });
  if (res.status === 401) redirectToSignIn();
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const message = (data as { error?: string }).error || res.statusText;
    throw new Error(message);
  }
  return data as T;
}

export async function apiBinary<T>(path: string, body: ArrayBuffer, contentType: string): Promise<T> {
  const headers = new Headers();
  headers.set("content-type", contentType);
  const res = await fetch(path, { method: "POST", headers, body, credentials: "same-origin" });
  if (res.status === 401) redirectToSignIn();
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
