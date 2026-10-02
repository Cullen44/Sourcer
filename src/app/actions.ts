"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dispatch, JOBS } from "../lib/jobs";
import { db } from "../lib/db";

/**
 * Save or unsave a creator. Twitch creators are keyed by their creators.id;
 * YouTube-only channels by channel ID. A YouTube channel linked to a Twitch
 * creator is saved as that Twitch creator, so it appears once.
 */
export async function toggleSaved(form: FormData) {
  const kind = String(form.get("kind"));
  const id = String(form.get("id"));
  let where: { creatorId: number } | { youtubeChannelId: string };
  if (kind === "twitch") {
    where = { creatorId: Number(id) };
  } else {
    const ch = await db.youtubeChannel.findUnique({ where: { channelId: id }, select: { creatorId: true } });
    where = ch?.creatorId ? { creatorId: ch.creatorId } : { youtubeChannelId: id };
  }
  const existing = await db.savedCreator.findFirst({ where });
  if (existing) await db.savedCreator.delete({ where: { id: existing.id } });
  else await db.savedCreator.create({ data: where });
  revalidatePath("/", "layout");
}

export async function saveNote(form: FormData) {
  const id = Number(form.get("savedId"));
  const note = String(form.get("note") ?? "").trim().slice(0, 2000);
  await db.savedCreator.update({ where: { id }, data: { note: note || null } });
  revalidatePath("/watchlist");
}

/** Start a GitHub workflow from the Overview page; the result shows as a banner. */
export async function runJob(form: FormData) {
  const job = JOBS.find((j) => j.file === String(form.get("file")));
  if (!job) redirect("/?runerr=" + encodeURIComponent("Unknown job"));
  let error: string | null = null;
  try {
    await dispatch(job);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  revalidatePath("/");
  redirect(error ? `/?runerr=${encodeURIComponent(error)}` : `/?ran=${encodeURIComponent(job.label)}`);
}
