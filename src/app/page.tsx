import Link from "next/link";
import { getOverview } from "../lib/queries";
import { ago, num } from "./format";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const o = await getOverview();
  const minsSinceOk = o.lastOk ? (Date.now() - o.lastOk.startedAt.getTime()) / 60_000 : Infinity;
  // Scheduled runs drift; treat up to ~1h as normal, beyond that as stalled.
  const health = minsSinceOk <= 45 ? "ok" : minsSinceOk <= 90 ? "warn" : "bad";
  const healthText = { ok: "Running", warn: "Late", bad: "Stalled" }[health];

  return (
    <>
      <h1>Overview</h1>
      <p className="sub">Data collection status. Nothing here is ranked or scored.</p>

      <div className="cards">
        <div className="card">
          <div className="label">Poller</div>
          <div className={`value ${health}`}>{healthText}</div>
          <div className="note">last successful poll {ago(o.lastOk?.startedAt)}</div>
        </div>
        <div className="card">
          <div className="label">Polls, last 24h</div>
          <div className="value">{o.runs24h}</div>
          <div className={`note ${o.failed24h ? "bad" : ""}`}>{o.failed24h} failed · ~72 expected</div>
        </div>
        <div className="card">
          <div className="label">Creators found</div>
          <div className="value">{num(o.creators)}</div>
          <div className="note">{num(o.newCreators24h)} new in last 24h</div>
        </div>
        <div className="card">
          <div className="label">Stream readings</div>
          <div className="value">{num(o.observations)}</div>
          <div className="note">raw, last 7 days</div>
        </div>
        <div className="card">
          <div className="label">Sponsor mentions</div>
          <div className="value">{num(o.mentions)}</div>
          <div className="note">across {o.competitors} competitors</div>
        </div>
      </div>

      {o.lastRun?.error && (
        <>
          <h2 className="bad">Latest poll failed ({ago(o.lastRun.startedAt)})</h2>
          <pre className="note-box" style={{ whiteSpace: "pre-wrap" }}>{o.lastRun.error.split("\n")[0]}</pre>
        </>
      )}

      <h2>Live in the latest poll</h2>
      <div className="table-wrap">
        {o.byTitle.length === 0 ? (
          <div className="empty">No completed polls yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Title</th><th className="num">Streams</th><th></th></tr>
            </thead>
            <tbody>
              {o.byTitle.map((t) => (
                <tr key={t.title}>
                  <td>{t.title}</td>
                  <td className="num">{num(t.streams)}</td>
                  <td><Link href={`/creators?title=${encodeURIComponent(t.title)}`}>Browse creators →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
