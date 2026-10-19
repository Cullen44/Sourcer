"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dispatch, JOBS } from "../lib/jobs";
import { db } from "../lib/db";

/** Save or unsave a YouTube channel. */
export async function toggleSaved(form: FormData) {
  const youtubeChannelId = String(form.get("id"));
  const existing = await db.savedCreator.findUnique({ where: { youtubeChannelId } });
  if (existing) await db.savedCreator.delete({ where: { id: existing.id } });
  else await db.savedCreator.create({ data: { youtubeChannelId } });
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
