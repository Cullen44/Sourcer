import Link from "next/link";
import { Fragment } from "react";
import { getWatchlist } from "../../lib/watchlist";
import { saveNote } from "../actions";
import { ago, day, labelName, num, pct } from "../format";
import { SaveButton } from "../save-button";

export const dynamic = "force-dynamic";

/** "480 ▲12%" style change vs a previous value, when there is one. */
function Change({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null || before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="muted"> ±0%</span>;
  return <span className={pct > 0 ? "up" : "down"}> {pct > 0 ? "▲" : "▼"}{Math.abs(pct)}%</span>;
}

export default async function Watchlist() {
  const list = await getWatchlist();

  return (
    <>
      <h1>Watchlist</h1>
      <p className="sub">
        Creators you've saved. Save with ☆ on the <Link href="/creators">Creators</Link> page or any creator's page.
        Changes compare the last 7 days with the 7 before, once that much history exists.
      </p>

      <div className="table-wrap">
        {list.length === 0 ? (
          <div className="empty">Nothing saved yet. Use ☆ next to a creator to add them.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Creator</th>
                <th>Now</th>
                <th className="num">Twitch avg 7d</th>
                <th className="num">Streams 7d</th>
                <th className="num">Followers</th>
                <th className="num">YT median views</th>
                <th className="num">YT uploads 30d</th>
                <th className="num">YT engagement</th>
                <th>Latest</th>
                <th>Sponsors seen</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <Fragment key={e.saved.id}>
                <tr className="has-note">
                  <td>
                    {e.saved.creatorId
                      ? <SaveButton kind="twitch" id={e.saved.creatorId} saved />
                      : <SaveButton kind="youtube" id={e.saved.youtubeChannelId!} saved />}
                  </td>
                  <td>
                    <Link href={e.link}>{e.name}</Link>
                    <div style={{ marginTop: 2 }}>
                      {e.twitch && <span className="badge twitch">Twitch</span>}
                      {e.youtube && <Link href={`/youtube/${e.youtube.channelId}`} className="badge youtube">YouTube</Link>}
                    </div>
                    {e.twitch && (e.twitch.branded || e.twitch.labels.length > 0) && (
                      <div style={{ marginTop: 2 }}>
                        {e.twitch.branded && <span className="chip warn">Branded</span>}
                        {e.twitch.labels.map((l) => <span key={l} className="chip">{labelName(l)}</span>)}
                      </div>
                    )}
                  </td>
                  <td style={{ minWidth: 140 }}>
                    {e.twitch?.live ? (
                      <><span className="ok">● Live</span> <span className="muted">{num(e.twitch.live.viewers)} on {e.twitch.live.game}</span></>
                    ) : e.twitch ? (
                      <span className="muted">last on target {ago(e.twitch.lastSeenAt)}</span>
                    ) : e.youtube ? (
                      <span className="muted">last upload {ago(e.youtube.lastUploadAt)}</span>
                    ) : null}
                  </td>
                  <td className="num">{e.twitch ? <>{num(e.twitch.avg7d)}<Change now={e.twitch.avg7d} before={e.twitch.avgPrev7d} /></> : <span className="muted">—</span>}</td>
                  <td className="num">{e.twitch ? num(e.twitch.streams7d) : <span className="muted">—</span>}</td>
                  <td className="num">{e.twitch?.followers != null ? <>{num(e.twitch.followers)}<Change now={e.twitch.followers} before={e.twitch.followersWeekAgo} /></> : <span className="muted">—</span>}</td>
                  <td className="num">{e.youtube ? <>{num(e.youtube.medianViews)}<Change now={e.youtube.medianViews} before={e.youtube.medianViewsWeekAgo} /></> : <span className="muted">—</span>}</td>
                  <td className="num">{e.youtube ? num(e.youtube.uploads30d) : <span className="muted">—</span>}</td>
                  <td className="num">{e.youtube ? pct(e.youtube.engagementRate) : <span className="muted">—</span>}</td>
                  <td style={{ minWidth: 220, maxWidth: 300, fontSize: 13 }}>
                    {e.twitch?.latest ? <div><span className="muted">Stream {ago(e.twitch.latest.at)}:</span> {e.twitch.latest.title}</div> : null}
                    {e.youtube?.latestVideo ? (
                      <div>
                        <span className="muted">Video {day(e.youtube.latestVideo.at)}:</span>{" "}
                        <a href={`https://www.youtube.com/watch?v=${e.youtube.latestVideo.id}`} target="_blank" rel="noreferrer">{e.youtube.latestVideo.title}</a>
                      </div>
                    ) : null}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {e.mentions.count === 0 ? <span className="muted">none</span> : (
                      <>
                        <span className="warn">{e.mentions.competitors.join(", ")}</span>
                        {e.mentions.latest?.promoCode ? <> <span className="chip">{e.mentions.latest.promoCode}</span></> : null}
                        <div className="muted">{e.mentions.count} mention{e.mentions.count > 1 ? "s" : ""}</div>
                      </>
                    )}
                  </td>
                </tr>
                <tr>
                  <td></td>
                  <td colSpan={10}>
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
