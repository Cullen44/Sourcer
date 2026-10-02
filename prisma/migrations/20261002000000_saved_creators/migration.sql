-- CreateTable
CREATE TABLE "saved_creators" (
    "id" SERIAL NOT NULL,
    "creator_id" INTEGER,
    "youtube_channel_id" TEXT,
    "note" TEXT,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_creators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_creators_creator_id_key" ON "saved_creators"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_creators_youtube_channel_id_key" ON "saved_creators"("youtube_channel_id");

-- AddForeignKey
ALTER TABLE "saved_creators" ADD CONSTRAINT "saved_creators_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "creators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_creators" ADD CONSTRAINT "saved_creators_youtube_channel_id_fkey" FOREIGN KEY ("youtube_channel_id") REFERENCES "youtube_channels"("channel_id") ON DELETE CASCADE ON UPDATE CASCADE;

