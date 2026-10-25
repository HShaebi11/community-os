CREATE SCHEMA "community_os";
--> statement-breakpoint
CREATE TABLE "community_os"."applications" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"applicant" text NOT NULL,
	"answers" text NOT NULL,
	"score" integer NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."autopilot_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"community_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."blocklist" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"hash" text NOT NULL,
	"evidence" text NOT NULL,
	"reporter" text NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."citations" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"message_id" text NOT NULL,
	"quote" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."demands" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"topic" text NOT NULL,
	"title" text,
	"one_liner" text,
	"member_ids" text[] DEFAULT '{}' NOT NULL,
	"message_ids" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."events" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone,
	"qr_svg" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "community_os"."files" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"message_id" text,
	"name" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."guests" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"community_id" text NOT NULL,
	"member_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'native' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."members" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"display_name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"do" text,
	"want" text,
	"offer" text,
	"notes" text,
	"public_opt_in" boolean DEFAULT false NOT NULL,
	"public_slug" text,
	"last_active" timestamp with time zone,
	"lead_locked_fields" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."messages" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_message_id" text NOT NULL,
	"author_raw" text NOT NULL,
	"member_id" text,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"is_noise" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"demand_id" text NOT NULL,
	"venue_id" text,
	"speaker_ids" text[] DEFAULT '{}' NOT NULL,
	"status" text NOT NULL,
	"explanation" text,
	"outreach_draft" text
);
--> statement-breakpoint
CREATE TABLE "community_os"."resources" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"message_id" text
);
--> statement-breakpoint
CREATE TABLE "community_os"."sources" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."sponsors" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"name" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "community_os"."timeline" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."venues" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"name" text NOT NULL,
	"area" text,
	"capacity" integer,
	"contact" text
);
--> statement-breakpoint
CREATE TABLE "community_os"."webhook_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"community_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"kinds" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_os"."workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"join_url" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "community_os"."applications" ADD CONSTRAINT "applications_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."autopilot_artifacts" ADD CONSTRAINT "autopilot_artifacts_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."blocklist" ADD CONSTRAINT "blocklist_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."citations" ADD CONSTRAINT "citations_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."demands" ADD CONSTRAINT "demands_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."events" ADD CONSTRAINT "events_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."files" ADD CONSTRAINT "files_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."guests" ADD CONSTRAINT "guests_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."members" ADD CONSTRAINT "members_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."messages" ADD CONSTRAINT "messages_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."messages" ADD CONSTRAINT "messages_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "community_os"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."proposals" ADD CONSTRAINT "proposals_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."resources" ADD CONSTRAINT "resources_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."sources" ADD CONSTRAINT "sources_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."sponsors" ADD CONSTRAINT "sponsors_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."timeline" ADD CONSTRAINT "timeline_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."venues" ADD CONSTRAINT "venues_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_os"."webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_community_id_workspaces_id_fk" FOREIGN KEY ("community_id") REFERENCES "community_os"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_dedup" ON "community_os"."messages" USING btree ("community_id","source_id","source_message_id");