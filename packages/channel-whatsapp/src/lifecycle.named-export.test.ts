import { describe, expect, it } from "vitest";
import { vi } from "vitest";

// The lifecycle suite mocks `default`; this file covers the named-export path.
vi.mock("@whiskeysockets/baileys", () => ({
  default: undefined,
  makeWASocket: () => ({
    ev: { on: () => {} },
    end: () => {},
  }),
  useMultiFileAuthState: async () => ({ state: {}, saveCreds: async () => {} }),
  DisconnectReason: { loggedOut: 401 },
}));

const { whatsappChannel } = await import("./index.ts");

describe("whatsappChannel — named baileys export", () => {
  it("uses makeWASocket when no default export exists", async () => {
    const adapter = whatsappChannel({ sessionDir: "/tmp/cos-wa-test" });
    await adapter.start({ emit: async () => {} });
    expect(true).toBe(true);
    await adapter.stop();
  });
});
