import Link from "next/link";
import { getPromoCodes, getSponsors } from "../../lib/queries";
import { ago, day, num } from "../format";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

const SOURCE_LABEL: Record<string, string> = { seed: "Known", youtube: "YouTube", twitch: "Twitch title", ad: "Meta ad" };

export default async function Sponsors({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const competitor = Number(sp.competitor) || undefined;
  const minViews = Number(sp.minViews) || 0;
  const [{ competitors, mentions }, codes] = await Promise.all([getSponsors({ competitor, minViews }), getPromoCodes()]);

  return (
    <>
      <h1>Sponsors</h1>
      <p className="sub">Competitors being watched, the promo codes found for each, and who is carrying them.</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Competitor</th><th>Priority</th><th className="num">Codes</th><th>Domains</th><th>FB page</th><th className="num">Active ads</th><th className="num">Mentions</th></tr>
          </thead>
          <tbody>
            {competitors.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/sponsors?competitor=${c.id}`}>{c.name}</Link></td>
                <td>{c.priority === 1 ? "Direct comp" : <span className="muted">Secondary</span>}</td>
                <td className="num">{num(c._count.codes)}</td>
                <td className="muted">{c.domains.join(", ")}</td>
                <td>{c.fbPageId ? "✓" : <span className="warn">missing</span>}</td>
                <td className="num">{num(c._count.ads)}</td>
                <td className="num">{num(c._count.mentions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Mentions</h2>
      <form className="filters">
        <select name="competitor" defaultValue={competitor ?? ""}>
          <option value="">All competitors</option>
          {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="minViews" defaultValue={String(minViews)}>
          <option value="0">Any views</option>
          <option value="500">500+ views</option>
          <option value="1000">1,000+ views</option>
          <option value="10000">10,000+ views</option>
        </select>
        <button type="submit">Filter</button>
      </form>
      <div className="table-wrap">
        {mentions.length === 0 ? (
          <div className="empty">None yet. Mentions appear after the nightly YouTube search and Twitch title scan.</div>
        ) : (
          <table>
            <thead><tr><th>Competitor</th><th>Code</th><th>Where</th><th>Channel</th><th>Video / stream</th><th className="num">Views</th><th>Published</th></tr></thead>
            <tbody>
              {mentions.map((m) => (
                <tr key={m.id}>
                  <td>{m.competitor.name}</td>
                  <td>{m.promoCode ? <span className="chip">{m.promoCode}</span> : "—"}</td>
                  <td className="muted">{m.platform === "youtube" ? "YouTube" : "Twitch"}</td>
                  <td>
                    {m.platform === "youtube" ? (
                      <Link href={`/youtube/${m.externalChannelId}`}>{m.channelTitle ?? m.externalChannelId}</Link>
                    ) : m.creator ? (
                      <Link href={`/creators/${m.creator.id}`}>{m.creator.displayName}</Link>
                    ) : (
                      m.channelTitle ?? m.externalChannelId
                    )}
                  </td>
                  <td><a href={m.url} target="_blank" rel="noreferrer">{m.title ?? m.url}</a></td>
                  <td className="num">{num(m.viewCount)}</td>
                  <td className="muted">{m.publishedAt ? day(m.publishedAt) : ago(m.observedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Twitch "views" are concurrent viewers when the stream was seen.</p>

      <h2>Promo codes</h2>
      <div className="table-wrap">
        {codes.length === 0 ? <div className="empty">No codes yet.</div> : (
          <table>
            <thead><tr><th>Competitor</th><th>Code</th><th>Found via</th><th>First seen</th><th>Last searched</th></tr></thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id}>
                  <td>{c.competitor.name}</td>
                  <td><span className="chip">{c.code}</span></td>
                  <td className="muted">{SOURCE_LABEL[c.source] ?? c.source}</td>
                  <td className="muted">{day(c.firstSeenAt)}</td>
                  <td className="muted">{c.lastSearchedAt ? ago(c.lastSearchedAt) : "not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
