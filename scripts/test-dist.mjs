// test:dist — the golden path against BUILT artifacts only.
//
// Every import below resolves through package.json "exports" → dist/, exactly
// what a consumer's bundler/runtime would load. If we ever ship a broken dist
// (e.g. the node:sqlite bundling bug, a missing asset, a bad dts), this fails
// even though src-level tests stayed green.
//
// Run: npm run build:packages && node scripts/test-dist.mjs

import { CommunityOS } from "@community-os/sdk";
import { SqliteStore } from "@community-os/store-sqlite";
import { parseWhatsAppExport } from "@community-os/whatsapp-import";

const ok = (cond, label) => {
  if (!cond) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
  console.log(`ok   ${label}`);
};

const store = new SqliteStore(); // :memory:
const cos = CommunityOS.store(store, { publicOrigin: "https://community.test" });

// workspace
const ws = await cos.createWorkspace({ name: "Dist Test Community", createdBy: "suite" });
ok(ws.id && ws.slug.includes("dist-test"), "createWorkspace over dist sdk");

// ingest two sources sharing a platform message id — dedupe is (communityId, sourceId, sourceMessageId)
const msgs = [
  { id: "1", author: "Ada", body: "i want a bread workshop", sentAt: "2025-01-01T00:00:00Z" },
  { id: "2", author: "Lin", body: "i can host at my studio", sentAt: "2025-01-01T00:01:00Z" },
];
await cos.ingest(ws.id, { source: { kind: "native", name: "a" }, messages: msgs });
const r2 = await cos.ingest(ws.id, { source: { kind: "slack", name: "b" }, messages: msgs });
ok(r2.inserted === 2, "cross-source ids coexist (dedupe composite key)");
const all = await store.listMessages(ws.id);
ok(all.length === 4, "4 messages stored across 2 sources");

// members + memory
const members = await cos.listMembers(ws.id);
ok(members.length === 2, "members extracted");
await cos.refreshMemory(ws.id);
const demands = await cos.listDemands(ws.id);
ok(demands.length >= 1, "demand extracted from memory refresh");

// pipeline: proposal → approve → outreach → live event → public page → rsvp
const pack = await cos.createProposal(ws.id, demands[0].id);
await cos.approveProposal(pack.id);
await cos.draftOutreach(pack.id);
const event = await cos.goLive(pack.id);
ok(event.slug && event.qrSvg.startsWith("<svg"), "goLive produced slug + QR svg");
const pub = await cos.publicEvent(event.slug);
ok(pub.speakers.length === 0 || Array.isArray(pub.speakers), "publicEvent readable");
await cos.rsvp(event.slug, { name: "Grace", email: "grace@test.dev" });
const guests = await store.listGuests(event.id);
ok(guests.length === 1, "rsvp recorded on dist");

// export strips the body field from messages; citation quotes are the
// deliberately-preserved evidence layer, not raw bodies.
const dump = await cos.exportWorkspace(ws.id);
ok(dump.messages.every((m) => !("body" in m)), "export strips message body fields");

// whatsapp-import dist: parse a real in-memory zip
const { zipSync, strToU8 } = await import("fflate");
const zip = zipSync({ "_chat.txt": strToU8("01/01/2025, 10:00 - Ada: i want a meetup\n") });
const parsed = parseWhatsAppExport(zip, "export.zip");
ok(parsed.messages.length === 1 && parsed.messages[0].authorRaw === "Ada", "whatsapp-import dist parses real zip");

store.close();
console.log("\ntest:dist — golden path green on built artifacts");
