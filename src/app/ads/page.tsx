import Link from "next/link";
import { adSummary, listAds } from "../../lib/queries";
import { ago, day, num } from "../format";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

const RUN_LABEL: Record<string, string> = { ok: "ok", empty: "no ads found", blocked: "⚠ blocked by Meta", error: "⚠ failed" };

export default async function Ads({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const f = { competitor: Number(sp.competitor) || undefined, status: sp.status ?? "active", q: sp.q ?? "" };
  const [summary, groups] = await Promise.all([adSummary(), listAds(f)]);
  const href = (over: Record<string, string | number | undefined>) =>
    `/ads?${new URLSearchParams(Object.entries({ ...f, ...over }).flatMap(([k, v]) => (v === undefined || v === "" ? [] : [[k, String(v)]])))}`;

  return (
    <>
      <h1>Meta ads</h1>
      <p className="sub">
        Competitors' active US ads from the public Meta Ad Library, collected daily. Meta shows a logged-out visitor
        only the first ~30 ads per advertiser, so for bigger advertisers this is a sample: new ads are recorded, but
        stopped ads are only tracked when every active ad is visible. Ads with identical copy, button and landing page
        are grouped, with the variant count. "Started" is when Meta says the ad began running.
        See <Link href="/changes">Changes</Link> for what's new this week.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Competitor</th><th className="num">Active ads seen</th><th className="num">Distinct</th><th className="num">Meta reports</th><th className="num">New, 7d</th><th className="num">Stopped, 7d</th><th>Last collection</th></tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.competitor.id}>
                <td><Link href={href({ competitor: s.competitor.id })}>{s.competitor.name}</Link></td>
                <td className="num">{s.competitor.fbPageIds.length ? num(s.active) : <span className="muted">no Page IDs</span>}</td>
                <td className="num">{s.competitor.fbPageIds.length ? num(s.distinct) : ""}</td>
                <td className="num">{s.reported === null ? <span className="muted">—</span> : `~${num(s.reported)}`}</td>
                <td className="num">{num(s.newThisWeek)}</td>
                <td className="num">{s.allComplete ? num(s.stoppedThisWeek) : <span className="muted" title="Only part of this advertiser's ads are visible, so stops can't be told apart from ads that didn't load">not tracked</span>}</td>
                <td className={s.lastRun?.status === "ok" ? "muted" : s.lastRun ? "bad" : "muted"} title={s.lastRun?.detail ?? undefined}>
                  {s.lastRun ? `${RUN_LABEL[s.lastRun.status] ?? s.lastRun.status}, ${ago(s.lastRun.startedAt)}` : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Ads</h2>
      <div className="tabs">
        {[["active", "Active"], ["stopped", "Stopped"], ["all", "All"]].map(([k, label]) => (
          <Link key={k} href={href({ status: k })} className={f.status === k ? "active" : ""}>{label}</Link>
        ))}
      </div>
      <form className="filters">
        <input type="hidden" name="status" value={f.status} />
        <select name="competitor" defaultValue={f.competitor ?? ""}>
          <option value="">All competitors</option>
          {summary.map((s) => <option key={s.competitor.id} value={s.competitor.id}>{s.competitor.name}</option>)}
        </select>
        <input name="q" placeholder="Search ad copy or code" defaultValue={f.q} />
        <button type="submit">Filter</button>
      </form>

      <div className="table-wrap">
        {groups.length === 0 ? (
          <div className="empty">No ads collected yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Competitor</th><th>Started</th><th>Ad copy</th><th className="num">Variants</th><th>Code</th><th>Landing</th><th>Format</th><th>Where</th><th></th></tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const a = g.ad;
                const sameDay = g.firstStarted && g.lastStarted && day(g.firstStarted) === day(g.lastStarted);
                return (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{a.competitor.name}{a.pageName && a.pageName !== a.competitor.name ? <div className="muted" style={{ fontSize: 12 }}>{a.pageName}</div> : null}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>
                      {g.lastStarted ? day(g.lastStarted) : "—"}
                      {g.firstStarted && !sameDay ? <div style={{ fontSize: 12 }}>first {day(g.firstStarted)}</div> : null}
                      {g.activeVariants === 0 && a.stoppedAt ? <div style={{ fontSize: 12 }}>stopped {day(a.stoppedAt)}</div> : null}
                    </td>
                    <td style={{ maxWidth: 440 }}>
                      {a.headline ? <strong>{a.headline}</strong> : null}
                      <div>{(a.creativeText ?? "").slice(0, 280)}{(a.creativeText ?? "").length > 280 ? "…" : ""}</div>
                      {a.ctaText ? <div className="muted" style={{ fontSize: 12 }}>Button: {a.ctaText}</div> : null}
                    </td>
                    <td className="num">
                      {g.variants.length > 1 ? <span title="Ads with identical copy, button and landing page">×{g.variants.length}</span> : <span className="muted">1</span>}
                      {f.status === "all" && g.activeVariants !== g.variants.length ? <div className="muted" style={{ fontSize: 12 }}>{g.activeVariants} active</div> : null}
                    </td>
                    <td>{a.promoCode ? <span className="chip">{a.promoCode}</span> : <span className="muted">—</span>}</td>
                    <td className="muted">{a.landingDomain ?? "—"}</td>
                    <td className="muted">{a.displayFormat?.toLowerCase() ?? "—"}</td>
                    <td className="muted">{g.platforms.join(", ") || "—"}</td>
                    <td><a href={`https://www.facebook.com/ads/library/?id=${a.adLibraryId}`} target="_blank" rel="noreferrer">View</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
