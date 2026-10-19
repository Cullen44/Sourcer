import { describe, expect, it } from "vitest";
import { canRun, JOBS, type LastRun } from "../src/lib/jobs";

const now = new Date("2026-10-02T12:00:00Z");
const run = (minutesAgo: number, status = "completed"): LastRun => ({
  status, conclusion: status === "completed" ? "success" : null, createdAt: new Date(now.getTime() - minutesAgo * 60_000),
  event: "schedule", url: "https://github.com/x",
});
const ads = JOBS.find((j) => j.file === "ads.yml")!;
const nightly = JOBS.find((j) => j.file === "nightly.yml")!;

describe("canRun", () => {
  it("allows a first run", () => expect(canRun(ads, null, now)).toEqual({ ok: true }));
  it("blocks while a run is queued or in progress", () => {
    expect(canRun(nightly, run(30, "in_progress"), now)).toEqual({ ok: false, reason: "already running" });
    expect(canRun(nightly, run(30, "queued"), now)).toEqual({ ok: false, reason: "already running" });
  });
  it("enforces each job's cooldown", () => {
    expect(canRun(ads, run(20), now)).toEqual({ ok: false, reason: "ran 20m ago; wait 40m" });
    expect(canRun(ads, run(61), now)).toEqual({ ok: true });
    expect(canRun(nightly, run(45), now)).toEqual({ ok: false, reason: "ran 45m ago; wait 15m" });
  });
});
