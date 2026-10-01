-- AlterTable
ALTER TABLE "ad_collection_runs" ADD COLUMN     "complete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reported_count" INTEGER;

