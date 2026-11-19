-- AlterTable
ALTER TABLE "candidates" ADD COLUMN "sourced_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "candidates_sourced_by_user_id_idx" ON "candidates"("sourced_by_user_id");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_sourced_by_user_id_fkey" FOREIGN KEY ("sourced_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from Candidate CREATE audit logs (most recent CREATE actor per candidate).
UPDATE "candidates" AS c
SET "sourced_by_user_id" = a."actor_user_id"
FROM (
  SELECT DISTINCT ON ("entity_id")
    "entity_id",
    "actor_user_id"
  FROM "audit_logs"
  WHERE "entity_type" = 'Candidate'
    AND "action" = 'CREATE'
    AND "actor_user_id" IS NOT NULL
  ORDER BY "entity_id", "created_at" ASC
) AS a
WHERE c."id" = a."entity_id"
  AND c."sourced_by_user_id" IS NULL;
