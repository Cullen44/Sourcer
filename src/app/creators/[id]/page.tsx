import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreator } from "../../../lib/queries";
import { isSaved } from "../../../lib/watchlist";
import { ago, compact, day, labelName, num, pct } from "../../format";
import { SaveButton } from "../../save-button";

export const dynamic = "force-dynamic";

export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCreator(Number(id));
  if (!data) notFound();
  const { creator: c, games, streams, daily } = data;
  const saved = await isSaved({ creatorId: c.id });
  // Follower change against the snapshot about a week back, once there is one.
  const latest = c.twitchDaily.find((d) => d.followers !== null);
  const weekBack = latest && c.twitchDaily.find((d) => d.followers !== null && latest.date.getTime() - d.date.getTime() >= 7 * 86_400_000);
  const growth = latest && weekBack && weekBack.followers ? (latest.followers! - weekBack.followers) / weekBack.followers : null;

  return (
    <>
      <p className="sub"><Link href="/creators">← Creators</Link></p>
      <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>{c.displayName} <SaveButton kind="twitch" id={c.id} saved={saved} label /></h1>
      <p className="sub">
        <a href={`https://twitch.tv/${c.login}`} target="_blank" rel="noreferrer">twitch.tv/{c.login}</a>
        {c.broadcasterType ? ` · ${c.broadcasterType}` : ""} · first seen {ago(c.firstSeenAt)} · last seen on a
        target title {ago(c.lastSeenAt)}
        {c.youtubeChannels.map((y) => (
          <span key={y.channelId}> · <Link href={`/youtube/${y.channelId}`}>YouTube: {y.title ?? "channel"}</Link></span>
        ))}
      </p>
      {c.description && <p className="note-box">{c.description}</p>}

      <div className="cards">
        <div className="card">
          <div className="label">Followers</div>
          <div className="value">{num(c.followers)}</div>
          <div className="note">{growth === null ? "change shows after a week of snapshots" : <span className={growth > 0 ? "up" : growth < 0 ? "down" : ""}>{pct(growth, true)} in 7 days</span>}</div>
        </div>
        <div className="card">
          <div className="label">Clips, 30 days</div>
          <div className="value">{c.clips30d === null ? "—" : c.clips30d >= 500 ? "500+" : num(c.clips30d)}</div>
          <div className="note">{c.clipViews30d === null ? "" : `${compact(c.clipViews30d)} views`}</div>
        </div>
        <div className="card">
          <div className="label">Content labels</div>
          <div className="value" style={{ fontSize: 14 }}>
            {c.brandedContent && <span className="chip warn">Branded content</span>}
            {c.contentLabels.length ? c.contentLabels.map((l) => <span key={l} className="chip">{labelName(l)}</span>) : !c.brandedContent && <span className="muted">none</span>}
          </div>
          <div className="note">{c.metricsAt ? `checked ${ago(c.metricsAt)}` : "not checked yet"}</div>
        </div>
      </div>

      <h2>Games, last 7 days</h2>
      <div className="table-wrap">
        {games.length === 0 ? <div className="empty">No readings in the last 7 days.</div> : (
          <table>
            <thead>
              <tr><th>Game</th><th>Target</th><th className="num">Streams</th><th className="num">Avg viewers</th><th className="num">Peak</th><th className="num">~Hours</th></tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.name}>
                  <td>{g.name}</td>
                  <td>{g.is_target ? <span className="chip">{g.canonical_title}</span> : <span className="muted">off-target</span>}</td>
                  <td className="num">{num(g.streams)}</td>
                  <td className="num">{num(g.avg_viewers)}</td>
                  <td className="num">{num(g.peak)}</td>
                  <td className="num">{g.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Hours are approximate: readings × poll interval.</p>

      <h2>Recent streams</h2>
      <div className="table-wrap">
        {streams.length === 0 ? <div className="empty">No streams in the last 7 days.</div> : (
          <table>
            <thead><tr><th>Started</th><th>Game</th><th>Title</th><th>Lang</th><th className="num">Peak viewers</th></tr></thead>
            <tbody>
              {streams.map((s) => (
                <tr key={`${s.stream_id}-${s.game}`}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{s.started_at.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td className={s.is_target ? "" : "muted"}>{s.game}</td>
                  <td>{s.title}</td>
                  <td>{s.language}</td>
                  <td className="num">{num(s.peak)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Daily history</h2>
      <div className="table-wrap">
        {daily.length === 0 ? <div className="empty">Fills in after the nightly rollup.</div> : (
          <table>
            <thead><tr><th>Date (UTC)</th><th>Game</th><th className="num">Avg viewers</th><th className="num">Peak</th><th className="num">Hours</th><th className="num">Streams</th></tr></thead>
            <tbody>
              {daily.map((d) => (
                <tr key={`${d.gameId}-${day(d.date)}`}>
                  <td>{day(d.date)}</td>
                  <td>{d.game.name}</td>
                  <td className="num">{num(Math.round(d.avgCcv))}</td>
                  <td className="num">{num(d.peakCcv)}</td>
                  <td className="num">{d.hoursStreamed.toFixed(1)}</td>
                  <td className="num">{d.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {c.twitchDaily.length > 0 && (
        <>
          <h2>Audience history</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date (UTC)</th><th className="num">Followers</th><th className="num">Clips 30d</th><th className="num">Clip views 30d</th></tr></thead>
              <tbody>
                {c.twitchDaily.map((d) => (
                  <tr key={day(d.date)}>
                    <td>{day(d.date)}</td>
                    <td className="num">{num(d.followers)}</td>
                    <td className="num">{num(d.clips30d)}</td>
                    <td className="num">{num(d.clipViews30d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {c.sponsorMentions.length > 0 && (
        <>
          <h2>Sponsor mentions</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Competitor</th><th>Code</th><th>Where</th><th>Seen</th></tr></thead>
              <tbody>
                {c.sponsorMentions.map((m) => (
                  <tr key={m.id}>
                    <td>{m.competitor.name}</td>
                    <td>{m.promoCode ?? "—"}</td>
                    <td><a href={m.url} target="_blank" rel="noreferrer">{m.title ?? m.url}</a></td>
                    <td className="muted">{ago(m.observedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
