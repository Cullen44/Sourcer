import Link from "next/link";
import { notFound } from "next/navigation";
import { getYoutubeChannel } from "../../../lib/queries";
import { ago, day, num } from "../../format";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const data = await getYoutubeChannel(channelId);
  if (!data) notFound();
  const { channel: c, mentions } = data;
  const statusClass = c.status === "tracked" ? "ok" : c.status === "rejected" ? "bad" : "warn";

  return (
    <>
      <p className="sub"><Link href="/creators?platform=youtube">← Creators</Link> · <Link href="/youtube">Discovery</Link></p>
      <h1>{c.title ?? c.channelId}</h1>
      <p className="sub">
        <a href={`https://www.youtube.com/channel/${c.channelId}`} target="_blank" rel="noreferrer">
          youtube.com/{c.handle ?? `channel/${c.channelId}`}
        </a>
        {" · "}<span className={statusClass}>{c.status}</span>
        {c.rejectReason ? ` (${c.rejectReason})` : ""}
        {c.creator && <> · Twitch: <Link href={`/creators/${c.creator.id}`}>{c.creator.displayName}</Link></>}
        {c.country ? ` · ${c.country}` : ""}
      </p>

      <div className="cards">
        <div className="card"><div className="label">Main title</div><div className="value" style={{ fontSize: 18 }}>{c.primaryTitle ?? "—"}</div>
          <div className="note">{c.titleShare === null ? "" : `${Math.round(c.titleShare * 100)}% of recent uploads on target titles`}</div></div>
        <div className="card"><div className="label">Median views</div><div className="value">{num(c.medianViews)}</div><div className="note">recent uploads</div></div>
        <div className="card"><div className="label">Uploads, 30 days</div><div className="value">{num(c.uploads30d)}</div><div className="note">last {ago(c.lastUploadAt)}</div></div>
        <div className="card"><div className="label">Subscribers</div><div className="value">{num(c.subscriberCount)}</div><div className="note">{num(c.videoCount)} videos total</div></div>
      </div>

      {mentions.length > 0 && (
        <>
          <h2>Sponsor mentions</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Competitor</th><th>Code</th><th>Video</th><th className="num">Views</th><th>Published</th></tr></thead>
              <tbody>
                {mentions.map((m) => (
                  <tr key={m.id}>
                    <td>{m.competitor.name}</td>
                    <td>{m.promoCode ? <span className="chip">{m.promoCode}</span> : "—"}</td>
                    <td><a href={m.url} target="_blank" rel="noreferrer">{m.title ?? m.url}</a></td>
                    <td className="num">{num(m.viewCount)}</td>
                    <td className="muted">{m.publishedAt ? day(m.publishedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Recent uploads</h2>
      <div className="table-wrap">
        {c.videos.length === 0 ? <div className="empty">Not fetched yet.</div> : (
          <table>
            <thead><tr><th>Published</th><th>Title</th><th>About</th><th className="num">Length</th><th className="num">Views</th></tr></thead>
            <tbody>
              {c.videos.map((v) => (
                <tr key={v.videoId}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{day(v.publishedAt)}</td>
                  <td><a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer">{v.title}</a></td>
                  <td>{v.canonicalTitle ? <span className="chip">{v.canonicalTitle}</span> : <span className="muted">other</span>}</td>
                  <td className="num muted">{v.durationSeconds === null ? "—" : fmtDuration(v.durationSeconds)}</td>
                  <td className="num">{num(v.viewCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Daily history</h2>
      <div className="table-wrap">
        {c.daily.length === 0 ? <div className="empty">Builds up one row per nightly refresh.</div> : (
          <table>
            <thead><tr><th>Date</th><th className="num">Subscribers</th><th className="num">Median views</th><th className="num">Uploads 30d</th></tr></thead>
            <tbody>
              {c.daily.map((d) => (
                <tr key={day(d.date)}>
                  <td>{day(d.date)}</td>
                  <td className="num">{num(d.subscriberCount)}</td>
                  <td className="num">{num(d.medianViews)}</td>
                  <td className="num">{num(d.uploads30d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function fmtDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
