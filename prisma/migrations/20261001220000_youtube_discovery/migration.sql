-- AlterTable
ALTER TABLE "creators" ADD COLUMN     "youtube_checked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "youtube_channels" DROP COLUMN "match_method",
ADD COLUMN     "country" TEXT,
ADD COLUMN     "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "handle" TEXT,
ADD COLUMN     "last_seen_in_search" TIMESTAMP(3),
ADD COLUMN     "last_upload_at" TIMESTAMP(3),
ADD COLUMN     "median_views" INTEGER,
ADD COLUMN     "primary_title" TEXT,
ADD COLUMN     "reject_reason" TEXT,
ADD COLUMN     "source" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'candidate',
ADD COLUMN     "title_share" DOUBLE PRECISION,
ADD COLUMN     "uploads_30d" INTEGER,
ADD COLUMN     "vetted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "youtube_videos" ADD COLUMN     "canonical_title" TEXT,
ADD COLUMN     "duration_seconds" INTEGER;

-- AlterTable
ALTER TABLE "sponsor_mentions" ADD COLUMN     "channel_title" TEXT,
ADD COLUMN     "published_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "youtube_channel_daily" (
    "channel_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "subscriber_count" BIGINT,
    "median_views" INTEGER,
    "uploads_30d" INTEGER,

    CONSTRAINT "youtube_channel_daily_pkey" PRIMARY KEY ("channel_id","date")
);

-- CreateTable
CREATE TABLE "youtube_usage" (
    "date" DATE NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "youtube_usage_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" SERIAL NOT NULL,
    "competitor_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_searched_at" TIMESTAMP(3),

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_competitor_id_code_key" ON "promo_codes"("competitor_id", "code");

-- CreateIndex
CREATE INDEX "youtube_channels_status_idx" ON "youtube_channels"("status");

-- AddForeignKey
ALTER TABLE "youtube_channel_daily" ADD CONSTRAINT "youtube_channel_daily_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "youtube_channels"("channel_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

