import Link from "next/link";
import { getSponsors } from "../../lib/queries";
import { ago, num } from "../format";

export const dynamic = "force-dynamic";

export default async function Sponsors() {
  const { competitors, mentions } = await getSponsors();

  return (
    <>
      <h1>Sponsors</h1>
      <p className="sub">Competitors being watched, and creators found carrying their codes.</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Competitor</th><th>Priority</th><th>Known codes</th><th>Domains</th><th>FB page</th><th className="num">Active ads</th><th className="num">Mentions</th></tr>
          </thead>
          <tbody>
            {competitors.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.priority === 1 ? "Direct comp" : <span className="muted">Secondary</span>}</td>
                <td>{c.knownCodes.length ? c.knownCodes.map((k) => <span key={k} className="chip">{k}</span>) : <span className="muted">—</span>}</td>
                <td className="muted">{c.domains.join(", ")}</td>
                <td>{c.fbPageId ? "✓" : <span className="warn">missing</span>}</td>
                <td className="num">{num(c._count.ads)}</td>
                <td className="num">{num(c._count.mentions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Latest mentions</h2>
      <div className="table-wrap">
        {mentions.length === 0 ? (
          <div className="empty">None yet. These appear once the YouTube promo-code search is running.</div>
        ) : (
          <table>
            <thead><tr><th>Competitor</th><th>Code</th><th>Channel</th><th>Video / stream</th><th className="num">Views</th><th>Seen</th></tr></thead>
            <tbody>
              {mentions.map((m) => (
                <tr key={m.id}>
                  <td>{m.competitor.name}</td>
                  <td>{m.promoCode ? <span className="chip">{m.promoCode}</span> : "—"}</td>
                  <td>{m.creator ? <Link href={`/creators/${m.creator.id}`}>{m.creator.displayName}</Link> : <span className="muted">{m.externalChannelId}</span>}</td>
                  <td><a href={m.url} target="_blank" rel="noreferrer">{m.title ?? m.url}</a></td>
                  <td className="num">{num(m.viewCount)}</td>
                  <td className="muted">{ago(m.observedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
