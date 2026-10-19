import Link from "next/link";
import { Fragment } from "react";
import { getWatchlist } from "../../lib/watchlist";
import { saveNote } from "../actions";
import { ago, compact, day, num, pct } from "../format";
import { SaveButton } from "../save-button";

export const dynamic = "force-dynamic";

/** "▲12%" style change vs a previous value, when there is one. */
function Change({ now, before }: { now: number | bigint | null; before: number | bigint | null }) {
  if (now === null || before === null || Number(before) === 0) return null;
  const p = Math.round(((Number(now) - Number(before)) / Number(before)) * 100);
  if (p === 0) return <span className="muted"> ±0%</span>;
  return <span className={p > 0 ? "up" : "down"}> {p > 0 ? "▲" : "▼"}{Math.abs(p)}%</span>;
}

export default async function Watchlist() {
  const list = await getWatchlist();

  return (
    <>
      <h1>Watchlist</h1>
      <p className="sub">
        Channels you've saved. Save with ☆ on the <Link href="/creators">Creators</Link> page or any channel page.
        Changes compare with the snapshot from a week ago, once that much history exists.
      </p>

      <div className="table-wrap">
        {list.length === 0 ? (
          <div className="empty">Nothing saved yet. Use ☆ next to a channel to add it.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Channel</th>
                <th className="num">Subscribers</th>
                <th className="num">Median views</th>
                <th className="num">Uploads 30d</th>
                <th className="num">EV uploads</th>
                <th className="num">Engagement</th>
                <th>Latest upload</th>
                <th>Competitors seen</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <Fragment key={e.saved.id}>
                  <tr className="has-note">
                    <td><SaveButton id={e.channel.channelId} saved /></td>
                    <td><Link href={`/youtube/${e.channel.channelId}`}>{e.name}</Link></td>
                    <td className="num">{compact(e.channel.subscriberCount)}<Change now={e.channel.subscriberCount} before={e.subscribersWeekAgo} /></td>
                    <td className="num">{num(e.channel.medianViews)}<Change now={e.channel.medianViews} before={e.medianViewsWeekAgo} /></td>
                    <td className="num">{num(e.channel.uploads30d)}</td>
                    <td className="num">{pct(e.channel.evShare)}</td>
                    <td className="num">{pct(e.channel.engagementRate)}</td>
                    <td style={{ minWidth: 220, maxWidth: 320, fontSize: 13 }}>
                      {e.latestVideo ? (
                        <>
                          <span className="muted">{day(e.latestVideo.publishedAt)}:</span>{" "}
                          <a href={`https://www.youtube.com/watch?v=${e.latestVideo.videoId}`} target="_blank" rel="noreferrer">{e.latestVideo.title}</a>
                        </>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {e.mentions.count === 0 ? <span className="muted">none</span> : (
                        <>
                          <span className="warn">{e.mentions.competitors.join(", ")}</span>
                          <div className="muted">{e.mentions.count} mention{e.mentions.count > 1 ? "s" : ""}</div>
                        </>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td></td>
                    <td colSpan={8}>
                      <form action={saveNote} className="note-form">
                        <input type="hidden" name="savedId" value={e.saved.id} />
                        <input className="note" name="note" defaultValue={e.saved.note ?? ""} placeholder="Add a note (outreach status, why they're interesting…)" />
                        <button type="submit">Save note</button>
                        <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>saved {ago(e.saved.savedAt)}</span>
                      </form>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
