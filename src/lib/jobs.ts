/**
 * Starting the GitHub Actions workflows from the viewer. Needs GITHUB_TOKEN in
 * .env: a fine-grained token with Actions read & write on this repo only.
 * Runs happen on GitHub exactly like scheduled ones; the viewer only asks.
 */

export interface Job {
  file: string;
  label: string;
  /** Minimum minutes between runs, so the button can't hammer an API. */
  cooldownMin: number;
  what: string;
}

export const JOBS: Job[] = [
  { file: "poll.yml", label: "Poll Twitch", cooldownMin: 5, what: "Live streams on the 7 titles, plus followed creators" },
  { file: "nightly.yml", label: "Nightly", cooldownMin: 60, what: "Rollup, Twitch profiles, YouTube search, discovery and refresh (uses YouTube quota)" },
  { file: "ads.yml", label: "Meta ads", cooldownMin: 60, what: "Competitors' active ads from the Meta Ad Library" },
];

export interface LastRun {
  status: string; // queued | in_progress | completed | ...
  conclusion: string | null; // success | failure | cancelled | skipped | null
  createdAt: Date;
  event: string; // schedule | workflow_dispatch | ...
  url: string;
}

/** Whether a job may start now, and why not when it can't. Pure; tested. */
export function canRun(job: Job, last: LastRun | null, now = new Date()): { ok: true } | { ok: false; reason: string } {
  if (!last) return { ok: true };
  if (last.status !== "completed") return { ok: false, reason: "already running" };
  const minutes = (now.getTime() - last.createdAt.getTime()) / 60_000;
  if (minutes < job.cooldownMin) return { ok: false, reason: `ran ${Math.floor(minutes)}m ago; wait ${Math.ceil(job.cooldownMin - minutes)}m` };
  return { ok: true };
}

// Overridable so the viewer can be tested against a stand-in API.
const API = process.env.GITHUB_API_URL?.trim() || "https://api.github.com";

function config() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim() || "Cullen44/Sourcer";
  return { token, repo };
}

export function jobsConfigured(): boolean {
  return !!config().token;
}

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = config();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function lastRun(job: Job): Promise<LastRun | null> {
  const { repo } = config();
  const data = await gh<{ workflow_runs: { status: string; conclusion: string | null; created_at: string; event: string; html_url: string }[] }>(
    `/repos/${repo}/actions/workflows/${job.file}/runs?per_page=1`,
  );
  const r = data.workflow_runs[0];
  return r ? { status: r.status, conclusion: r.conclusion, createdAt: new Date(r.created_at), event: r.event, url: r.html_url } : null;
}

let defaultBranch: string | null = null;

/** Start a job, re-checking the cooldown on the server so a stale page can't bypass it. */
export async function dispatch(job: Job): Promise<void> {
  const check = canRun(job, await lastRun(job));
  if (!check.ok) throw new Error(`${job.label}: ${check.reason}`);
  const { repo } = config();
  defaultBranch ??= (await gh<{ default_branch: string }>(`/repos/${repo}`)).default_branch;
  await gh(`/repos/${repo}/actions/workflows/${job.file}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: defaultBranch }),
  });
}
