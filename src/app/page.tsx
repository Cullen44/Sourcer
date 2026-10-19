import Link from "next/link";
import { adCollectorHealth, getOverview, getYoutubeOverview } from "../lib/queries";
import { ago, num } from "./format";
import { RunPanel } from "./run-panel";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [o, yt, ads] = await Promise.all([getOverview(), getYoutubeOverview(), adCollectorHealth()]);

  return (
    <>
      <h1>Overview</h1>
      <p className="sub">
        Creator sourcing for Boba Charge: YouTube channels about hosting short-term rentals, with EV coverage as a bonus.
        Nothing here is ranked or scored.
      </p>

      <div className="cards">
        <div className="card">
          <div className="label">Tracked channels</div>
          <div className="value">{num(o.channels)}</div>
          <div className="note">{num(o.new24h)} added in last 24h</div>
        </div>
        <div className="card">
          <div className="label">Cover EVs</div>
          <div className="value">{num(o.ev)}</div>
          <div className="note"><Link href="/creators?ev=ev">browse →</Link></div>
        </div>
        <div className="card">
          <div className="label">Discovery queue</div>
          <div className="value">{num(yt.counts.candidate ?? 0)}</div>
          <div className="note">waiting · {num(yt.counts.rejected ?? 0)} rejected · {num(yt.unitsToday)} / 10,000 units today</div>
        </div>
        <div className="card">
          <div className="label">Competitor mentions</div>
          <div className="value">{num(o.mentions)}</div>
          <div className="note">across {o.competitors} brands</div>
        </div>
        <div className="card">
          <div className="label">Meta ads</div>
          <div className={`value ${ads.pages === 0 ? "" : ads.ok ? "ok" : "bad"}`}>
            {ads.pages === 0 ? "Not set up" : ads.failed.length ? "Failing" : ads.stale.length ? "Stalled" : "OK"}
          </div>
          <div className="note">
            {ads.pages === 0
              ? "add Facebook Page IDs in src/config/competitors.ts"
              : ads.failed.length
                ? `${ads.failed.map((f) => f.competitor).join(", ")}: ${ads.failed[0]?.run?.status ?? "never collected"}`
                : `last collected ${ago(ads.lastRun)}`}
          </div>
        </div>
      </div>

      <h2>Jobs</h2>
      <RunPanel ran={sp.ran} runErr={sp.runerr} />
    </>
  );
}
