-- Turn on row level security for every table, with no policies.
--
-- Supabase exposes tables in the public schema through its Data API. With
-- RLS on and no policies, that API can read and write nothing. The pipeline
-- and the viewer connect as the table owner (postgres), which bypasses RLS,
-- so they are unaffected.
ALTER TABLE "games" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "poll_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stream_observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "youtube_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "youtube_videos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "youtube_channel_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "youtube_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creator_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_creators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competitors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promo_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "competitor_ads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ad_collection_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sponsor_mentions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
