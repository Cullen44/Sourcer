import Link from "next/link";
import { db } from "../../lib/db";
import { getChanges } from "../../report/changes";
import { day, num } from "../format";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

export default async function Changes({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const days = [7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 7;
  const ch = await getChanges(db, days);

  return (
    <>
      <h1>What changed</h1>
      <p className="sub">
        Sponsor watch, {day(ch.since)} to {day(ch.now)}: new and stopped ads, new codes, and creators seen carrying a
        competitor for the first time. Meta shows only the first ~30 ads per advertiser, so for bigger advertisers ads
        are a sample and stops aren't tracked. For a Markdown copy, run <code>npm run report</code>.
      </p>
      <div className="tabs">
        {[7, 14, 30].map((d) => (
          <Link key={d} href={`/changes?days=${d}`} className={days === d ? "active" : ""}>Last {d} days</Link>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Competitor</th><th className="num">Active ads</th><th className="num">New ads (distinct)</th><th className="num">Stopped</th><th className="num">New codes</th><th className="num">New creators</th><th>New landing domains</th></tr>
          </thead>
          <tbody>
            {ch.competitors.map((c) => (
              <tr key={c.competitor.id}>
                <td><a href={`#c${c.competitor.id}`}>{c.competitor.name}</a></td>
                <td className="num">{num(c.active)}{c.reported !== null && !c.complete ? <span className="muted"> of ~{num(c.reported)}</span> : null}</td>
                <td className="num">{num(c.newAds.length)}{c.newAds.length ? <span className="muted"> ({num(c.newAdGroups.length)})</span> : null}</td>
                <td className="num">{c.complete ? num(c.stoppedAds.length) : <span className="muted">not tracked</span>}</td>
                <td className="num">{num(c.newCodes.length)}</td>
                <td className="num">{num(c.newCreators.length)}</td>
                <td className="muted">{c.newDomains.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ch.competitors.map((c) => {
        if (!c.newAds.length && !c.stoppedAds.length && !c.newCodes.length && !c.newCreators.length) return null;
        return (
          <section key={c.competitor.id} id={`c${c.competitor.id}`}>
            <h2>{c.competitor.name}</h2>
            {c.newCodes.length > 0 && (
              <p>New codes: {c.newCodes.map((x) => <span key={x.id} className="chip" title={`found via ${x.source}`}>{x.code}</span>)}</p>
            )}
            {c.newAdGroups.length > 0 && (
              <div className="table-wrap" style={{ marginBottom: 12 }}>
                <table>
                  <thead><tr><th>New ad, started</th><th>Copy</th><th className="num">Variants</th><th>Code</th><th>Landing</th></tr></thead>
                  <tbody>
                    {c.newAdGroups.slice(0, 25).map(({ ad: a, variants, lastStarted }) => (
                      <tr key={a.id}>
                        <td className="muted" style={{ whiteSpace: "nowrap" }}>
                          <a href={`https://www.facebook.com/ads/library/?id=${a.adLibraryId}`} target="_blank" rel="noreferrer">{lastStarted ? day(lastStarted) : "?"}</a>
                        </td>
                        <td>{a.headline ? <strong>{a.headline} </strong> : null}{(a.creativeText ?? "").slice(0, 200)}</td>
                        <td className="num">{variants.length > 1 ? `×${variants.length}` : <span className="muted">1</span>}</td>
                        <td>{a.promoCode ? <span className="chip">{a.promoCode}</span> : "—"}</td>
                        <td className="muted">{a.landingDomain ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {c.stoppedAds.length > 0 && <p className="muted">{c.stoppedAds.length} {c.stoppedAds.length === 1 ? "ad" : "ads"} stopped running.</p>}
            {c.newCreators.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Creator newly seen</th><th>Where</th><th>Code</th><th>Video / stream</th><th className="num">Views</th></tr></thead>
                  <tbody>
                    {c.newCreators.map((m) => (
                      <tr key={m.id}>
                        <td>
                          {m.platform === "youtube"
                            ? <Link href={`/youtube/${m.externalChannelId}`}>{m.channelTitle ?? m.externalChannelId}</Link>
                            : m.creatorId ? <Link href={`/creators/${m.creatorId}`}>{m.channelTitle}</Link> : m.channelTitle}
                        </td>
                        <td className="muted">{m.platform === "youtube" ? "YouTube" : "Twitch"}</td>
                        <td>{m.promoCode ? <span className="chip">{m.promoCode}</span> : "—"}</td>
                        <td><a href={m.url} target="_blank" rel="noreferrer">{m.title ?? m.url}</a></td>
                        <td className="num">{num(m.viewCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
