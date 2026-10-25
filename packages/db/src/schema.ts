import { boolean, integer, jsonb, pgSchema, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const cos = pgSchema("community_os");

export const workspaces = cos.table("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  joinUrl: text("join_url"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sources = cos.table("sources", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
});

export const members = cos.table("members", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  do: text("do"),
  want: text("want"),
  offer: text("offer"),
  notes: text("notes"),
  publicOptIn: boolean("public_opt_in").notNull().default(false),
  publicSlug: text("public_slug"),
  lastActive: timestamp("last_active", { withTimezone: true }),
  leadLockedFields: text("lead_locked_fields").array().notNull().default([]),
});

export const messages = cos.table(
  "messages",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    sourceMessageId: text("source_message_id").notNull(),
    authorRaw: text("author_raw").notNull(),
    memberId: text("member_id"),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    isNoise: boolean("is_noise").notNull().default(false),
  },
  (t) => [uniqueIndex("messages_dedup").on(t.communityId, t.sourceId, t.sourceMessageId)],
);

export const files = cos.table("files", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  messageId: text("message_id"),
  name: text("name").notNull(),
  storagePath: text("storage_path").notNull(),
  mime: text("mime").notNull(),
});

export const citations = cos.table("citations", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  objectType: text("object_type").notNull(),
  objectId: text("object_id").notNull(),
  messageId: text("message_id").notNull(),
  quote: text("quote").notNull(),
});

export const resources = cos.table("resources", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title").notNull(),
  messageId: text("message_id"),
});

export const demands = cos.table("demands", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  title: text("title"),
  oneLiner: text("one_liner"),
  memberIds: text("member_ids").array().notNull().default([]),
  messageIds: text("message_ids").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const venues = cos.table("venues", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  area: text("area"),
  capacity: integer("capacity"),
  contact: text("contact"),
});

export const sponsors = cos.table("sponsors", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  notes: text("notes"),
});

export const proposals = cos.table("proposals", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  demandId: text("demand_id").notNull(),
  venueId: text("venue_id"),
  speakerIds: text("speaker_ids").array().notNull().default([]),
  status: text("status").notNull(),
  explanation: text("explanation"),
  outreachDraft: text("outreach_draft"),
});

export const events = cos.table("events", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  proposalId: text("proposal_id").notNull(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  qrSvg: text("qr_svg").notNull().default(""),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
});

export const guests = cos.table("guests", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  memberId: text("member_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  source: text("source").notNull().default("native"),
});

export const timeline = cos.table("timeline", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const applications = cos.table("applications", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  applicant: text("applicant").notNull(),
  answers: text("answers").notNull(),
  score: integer("score").notNull(),
  decision: text("decision").notNull(),
  reason: text("reason").notNull(),
});

export const blocklist = cos.table("blocklist", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  hash: text("hash").notNull(),
  evidence: text("evidence").notNull(),
  reporter: text("reporter").notNull(),
  confirmed: boolean("confirmed").notNull().default(false),
});

export const artifacts = cos.table("autopilot_artifacts", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  body: text("body").notNull(),
});

export const webhookSubscriptions = cos.table("webhook_subscriptions", {
  id: text("id").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  kinds: text("kinds").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
