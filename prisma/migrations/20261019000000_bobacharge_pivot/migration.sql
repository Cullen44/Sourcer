-- Pivot from gaming (Twitch + YouTube, for 1v1Me) to short-term-rental and EV
-- creators on YouTube (for BobaCharge). The owner asked for all existing
-- creators, channels, sponsor data and ads to be cleared, with no backup.
-- youtube_usage is kept: it tracks today's API quota, not sourcing data.
TRUNCATE "youtube_channels", "youtube_videos", "youtube_channel_daily", "saved_creators",
         "sponsor_mentions", "promo_codes", "competitor_ads", "ad_collection_runs", "competitors"
  RESTART IDENTITY CASCADE;

-- DropForeignKey
ALTER TABLE "stream_observations" DROP CONSTRAINT "stream_observations_poll_run_id_fkey";

-- DropForeignKey
ALTER TABLE "stream_observations" DROP CONSTRAINT "stream_observations_creator_id_fkey";

-- DropForeignKey
ALTER TABLE "stream_observations" DROP CONSTRAINT "stream_observations_game_id_fkey";

-- DropForeignKey
ALTER TABLE "creator_daily" DROP CONSTRAINT "creator_daily_creator_id_fkey";

-- DropForeignKey
ALTER TABLE "creator_daily" DROP CONSTRAINT "creator_daily_game_id_fkey";

-- DropForeignKey
ALTER TABLE "creator_twitch_daily" DROP CONSTRAINT "creator_twitch_daily_creator_id_fkey";

-- DropForeignKey
ALTER TABLE "youtube_channels" DROP CONSTRAINT "youtube_channels_creator_id_fkey";

-- DropForeignKey
ALTER TABLE "creator_scores" DROP CONSTRAINT "creator_scores_creator_id_fkey";

-- DropForeignKey
ALTER TABLE "saved_creators" DROP CONSTRAINT "saved_creators_creator_id_fkey";

-- DropForeignKey
ALTER TABLE "sponsor_mentions" DROP CONSTRAINT "sponsor_mentions_creator_id_fkey";

-- DropIndex
DROP INDEX "saved_creators_creator_id_key";

-- AlterTable
ALTER TABLE "youtube_channels" DROP COLUMN "creator_id",
DROP COLUMN "primary_title",
DROP COLUMN "title_share",
ADD COLUMN     "ev_share" DOUBLE PRECISION,
ADD COLUMN     "str_share" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "youtube_videos" DROP COLUMN "canonical_title",
ADD COLUMN     "topics" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "saved_creators" DROP COLUMN "creator_id",
ALTER COLUMN "youtube_channel_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "sponsor_mentions" DROP COLUMN "creator_id";

-- DropTable
DROP TABLE "games";

-- DropTable
DROP TABLE "creators";

-- DropTable
DROP TABLE "poll_runs";

-- DropTable
DROP TABLE "stream_observations";

-- DropTable
DROP TABLE "creator_daily";

-- DropTable
DROP TABLE "creator_twitch_daily";

-- DropTable
DROP TABLE "creator_scores";

