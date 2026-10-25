-- Reconcile pre-existing duplicates before the unique indexes below —
-- earlier stores allowed colliding public slugs and normalized display
-- names. The canonical member (MIN id, deterministic) keeps the claim;
-- each duplicate keeps its row and every reference to it under a
-- deterministic id-derived suffix, so nothing is silently dropped.
UPDATE "community_os"."members" m
SET "public_slug" = m."public_slug" || '-' || substring(m."id" from 1 for 6)
WHERE m."public_slug" IS NOT NULL
	AND m."id" <> (
		SELECT min(m2."id") FROM "community_os"."members" m2
		WHERE m2."public_slug" = m."public_slug"
	);--> statement-breakpoint
UPDATE "community_os"."members" m
SET "display_name" = m."display_name" || ' #' || substring(m."id" from 1 for 6)
WHERE m."id" <> (
	SELECT min(m2."id") FROM "community_os"."members" m2
	WHERE m2."community_id" = m."community_id"
		AND lower(btrim(m2."display_name")) = lower(btrim(m."display_name"))
);--> statement-breakpoint
CREATE UNIQUE INDEX "members_public_slug" ON "community_os"."members" USING btree ("public_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "members_name_norm" ON "community_os"."members" USING btree ("community_id",lower(btrim("display_name")));
