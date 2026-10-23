import { createDb } from "../src/index.ts";
import { member, organization, user, workspaceLeads, workspaces } from "../src/schema.ts";
import { eq } from "drizzle-orm";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const db = createDb(url);

const allWorkspaces = await db.select().from(workspaces);
const allOrgs = await db.select({ id: organization.id }).from(organization);
const orgIds = new Set(allOrgs.map((o) => o.id));

let orgsInserted = 0;
for (const ws of allWorkspaces) {
  if (orgIds.has(ws.id)) continue;
  await db
    .insert(organization)
    .values({ id: ws.id, name: ws.name, slug: ws.slug, createdAt: ws.createdAt })
    .onConflictDoNothing();
  orgsInserted++;
}

const leads = await db.select().from(workspaceLeads);
const allMembers = await db
  .select({ organizationId: member.organizationId, userId: member.userId })
  .from(member);
const memberKeys = new Set(allMembers.map((m) => `${m.organizationId}:${m.userId}`));

let membersInserted = 0;
for (const lead of leads) {
  if (memberKeys.has(`${lead.workspaceId}:${lead.userId}`)) continue;
  const ws = allWorkspaces.find((w) => w.id === lead.workspaceId);
  const role = ws && ws.createdBy === lead.userId ? "owner" : "admin";
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, lead.userId)).limit(1);
  if (!u) {
    console.log(`skipping lead ${lead.userId} in ${lead.workspaceId}: no user row`);
    continue;
  }
  await db
    .insert(member)
    .values({
      id: crypto.randomUUID(),
      organizationId: lead.workspaceId,
      userId: lead.userId,
      role,
      createdAt: ws?.createdAt ?? new Date(),
    })
    .onConflictDoNothing();
  membersInserted++;
}

console.log(`backfill done: ${orgsInserted} organizations, ${membersInserted} members inserted`);
