-- AlterTable
ALTER TABLE "creators" ADD COLUMN     "branded_content" BOOLEAN,
ADD COLUMN     "clip_views_30d" INTEGER,
ADD COLUMN     "clips_30d" INTEGER,
ADD COLUMN     "content_labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "followers" INTEGER,
ADD COLUMN     "metrics_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "youtube_channels" ADD COLUMN     "engagement_rate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "youtube_videos" ADD COLUMN     "comment_count" BIGINT,
ADD COLUMN     "like_count" BIGINT;

-- AlterTable
ALTER TABLE "youtube_channel_daily" ADD COLUMN     "engagement_rate" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "creator_twitch_daily" (
    "creator_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER,
    "clips_30d" INTEGER,
    "clip_views_30d" INTEGER,

    CONSTRAINT "creator_twitch_daily_pkey" PRIMARY KEY ("creator_id","date")
);

-- AddForeignKey
ALTER TABLE "creator_twitch_daily" ADD CONSTRAINT "creator_twitch_daily_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- New tables get RLS too (see 20261002010000_enable_rls).
ALTER TABLE "creator_twitch_daily" ENABLE ROW LEVEL SECURITY;
