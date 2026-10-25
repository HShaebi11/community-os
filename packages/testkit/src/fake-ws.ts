/** Scriptable WebSocket fake for channel-adapter lifecycle tests.
 *  Install with `vi.stubGlobal("WebSocket", FakeWebSocket)` — adapters call the
 *  global constructor, then drive them via `FakeWebSocket.instances` or
 *  `FakeWebSocket.latest`. */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static get latest(): FakeWebSocket {
    const ws = this.instances.at(-1);
    if (!ws) throw new Error("no FakeWebSocket constructed");
    return ws;
  }
  static reset() {
    FakeWebSocket.instances = [];
  }

  readonly url: string;
  onmessage: ((ev: { data: string }) => unknown) | null = null;
  onopen: (() => unknown) | null = null;
  onclose: ((ev?: unknown) => unknown) | null = null;
  onerror: ((ev?: unknown) => unknown) | null = null;
  sent: string[] = [];
  readyState = 0;
  closed = false;

  constructor(url: string | URL) {
    this.url = String(url);
    this.readyState = 1;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.());
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.());
  }

  /** Push a frame into the adapter — object payloads are JSON-encoded. */
  simulateMessage(data: unknown) {
    return this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  simulateClose(ev?: unknown) {
    this.closed = true;
    this.readyState = 3;
    return this.onclose?.(ev);
  }
  simulateError(ev?: unknown) {
    return this.onerror?.(ev);
  }

  /** Frames the adapter sent, JSON-parsed. */
  sentFrames<T = unknown>(): T[] {
    return this.sent.map((s) => JSON.parse(s) as T);
  }
}
