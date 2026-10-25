ALTER TABLE "community_os"."events" ADD COLUMN "rsvp_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Reconcile pre-existing duplicates before the unique index below: a
-- repeated RSVP is an update, so duplicate (event, email) rows are
-- redundant registrations by the same person. The earliest row (MIN id)
-- survives deterministically.
DELETE FROM "community_os"."guests" g
WHERE g."id" <> (
	SELECT min(g2."id") FROM "community_os"."guests" g2
	WHERE g2."event_id" = g."event_id" AND g2."email" = g."email"
);--> statement-breakpoint
-- Backfill the seat counter from the surviving guest rows.
UPDATE "community_os"."events" e
SET "rsvp_count" = (
	SELECT count(*) FROM "community_os"."guests" g WHERE g."event_id" = e."id"
);--> statement-breakpoint
CREATE UNIQUE INDEX "guests_event_email" ON "community_os"."guests" USING btree ("event_id","email");
