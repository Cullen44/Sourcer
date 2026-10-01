-- AlterTable: one Page ID per competitor becomes a list; keep any existing value.
ALTER TABLE "competitors" ADD COLUMN     "fb_page_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "competitors" SET "fb_page_ids" = ARRAY["fb_page_id"] WHERE "fb_page_id" IS NOT NULL;
ALTER TABLE "competitors" DROP COLUMN "fb_page_id";

-- AlterTable
ALTER TABLE "competitor_ads" ADD COLUMN     "cta_text" TEXT,
ADD COLUMN     "display_format" TEXT,
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "landing_url" TEXT,
ADD COLUMN     "page_id" TEXT,
ADD COLUMN     "page_name" TEXT,
ADD COLUMN     "stopped_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ad_collection_runs" (
    "id" SERIAL NOT NULL,
    "competitor_id" INTEGER NOT NULL,
    "page_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "ads_found" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT,

    CONSTRAINT "ad_collection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_collection_runs_competitor_id_started_at_idx" ON "ad_collection_runs"("competitor_id", "started_at");

-- AddForeignKey
ALTER TABLE "ad_collection_runs" ADD CONSTRAINT "ad_collection_runs_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

