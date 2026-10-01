-- CreateTable
CREATE TABLE "games" (
    "id" SERIAL NOT NULL,
    "twitch_game_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canonical_title" TEXT,
    "is_target" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creators" (
    "id" SERIAL NOT NULL,
    "twitch_user_id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "broadcaster_type" TEXT,
    "profile_image_url" TEXT,
    "total_views" BIGINT,
    "youtube_channel_id" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enriched_at" TIMESTAMP(3),

    CONSTRAINT "creators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_runs" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "streams_seen" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "poll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_observations" (
    "id" BIGSERIAL NOT NULL,
    "poll_run_id" INTEGER NOT NULL,
    "creator_id" INTEGER NOT NULL,
    "game_id" INTEGER NOT NULL,
    "stream_id" TEXT NOT NULL,
    "viewer_count" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stream_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_daily" (
    "creator_id" INTEGER NOT NULL,
    "game_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "avg_ccv" DOUBLE PRECISION NOT NULL,
    "peak_ccv" INTEGER NOT NULL,
    "hours_streamed" DOUBLE PRECISION NOT NULL,
    "sessions" INTEGER NOT NULL,
    "last_title" TEXT,
    "language" TEXT,

    CONSTRAINT "creator_daily_pkey" PRIMARY KEY ("creator_id","game_id","date")
);

-- CreateTable
CREATE TABLE "youtube_channels" (
    "id" SERIAL NOT NULL,
    "creator_id" INTEGER,
    "channel_id" TEXT NOT NULL,
    "title" TEXT,
    "subscriber_count" BIGINT,
    "total_views" BIGINT,
    "video_count" INTEGER,
    "uploads_playlist_id" TEXT,
    "match_method" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "youtube_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_videos" (
    "video_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "view_count" BIGINT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "youtube_videos_pkey" PRIMARY KEY ("video_id")
);

-- CreateTable
CREATE TABLE "creator_scores" (
    "id" SERIAL NOT NULL,
    "creator_id" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relevance" DOUBLE PRECISION NOT NULL,
    "trajectory" DOUBLE PRECISION NOT NULL,
    "consistency" DOUBLE PRECISION NOT NULL,
    "scale" DOUBLE PRECISION NOT NULL,
    "sponsor_density" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB,

    CONSTRAINT "creator_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "fb_page_id" TEXT,
    "domains" TEXT[],
    "known_codes" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_ads" (
    "id" SERIAL NOT NULL,
    "competitor_id" INTEGER NOT NULL,
    "ad_library_id" TEXT NOT NULL,
    "creative_text" TEXT,
    "landing_domain" TEXT,
    "promo_code" TEXT,
    "platforms" TEXT[],
    "started_at" TIMESTAMP(3),
    "first_observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "competitor_ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_mentions" (
    "id" SERIAL NOT NULL,
    "competitor_id" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "creator_id" INTEGER,
    "external_channel_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "view_count" BIGINT,
    "promo_code" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "games_twitch_game_id_key" ON "games"("twitch_game_id");

-- CreateIndex
CREATE UNIQUE INDEX "creators_twitch_user_id_key" ON "creators"("twitch_user_id");

-- CreateIndex
CREATE INDEX "creators_last_seen_at_idx" ON "creators"("last_seen_at");

-- CreateIndex
CREATE INDEX "poll_runs_started_at_idx" ON "poll_runs"("started_at");

-- CreateIndex
CREATE INDEX "stream_observations_observed_at_idx" ON "stream_observations"("observed_at");

-- CreateIndex
CREATE INDEX "stream_observations_creator_id_observed_at_idx" ON "stream_observations"("creator_id", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "stream_observations_poll_run_id_stream_id_key" ON "stream_observations"("poll_run_id", "stream_id");

-- CreateIndex
CREATE INDEX "creator_daily_date_idx" ON "creator_daily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_channels_channel_id_key" ON "youtube_channels"("channel_id");

-- CreateIndex
CREATE INDEX "youtube_videos_channel_id_published_at_idx" ON "youtube_videos"("channel_id", "published_at");

-- CreateIndex
CREATE INDEX "creator_scores_computed_at_total_idx" ON "creator_scores"("computed_at", "total");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_name_key" ON "competitors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_ads_ad_library_id_key" ON "competitor_ads"("ad_library_id");

-- CreateIndex
CREATE INDEX "competitor_ads_competitor_id_is_active_idx" ON "competitor_ads"("competitor_id", "is_active");

-- CreateIndex
CREATE INDEX "sponsor_mentions_external_channel_id_idx" ON "sponsor_mentions"("external_channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_mentions_competitor_id_url_key" ON "sponsor_mentions"("competitor_id", "url");

-- AddForeignKey
ALTER TABLE "stream_observations" ADD CONSTRAINT "stream_observations_poll_run_id_fkey" FOREIGN KEY ("poll_run_id") REFERENCES "poll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_observations" ADD CONSTRAINT "stream_observations_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_observations" ADD CONSTRAINT "stream_observations_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_daily" ADD CONSTRAINT "creator_daily_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_daily" ADD CONSTRAINT "creator_daily_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_channels" ADD CONSTRAINT "youtube_channels_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_videos" ADD CONSTRAINT "youtube_videos_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "youtube_channels"("channel_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_scores" ADD CONSTRAINT "creator_scores_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_ads" ADD CONSTRAINT "competitor_ads_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_mentions" ADD CONSTRAINT "sponsor_mentions_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_mentions" ADD CONSTRAINT "sponsor_mentions_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
