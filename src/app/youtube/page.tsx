import Link from "next/link";
import { DISCOVERY } from "../../config/youtube";
import { listYoutubeChannels, PAGE_SIZE, youtubeStatusCounts } from "../../lib/queries";
import { ago, num, pct } from "../format";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

const STATUSES = [
  { key: "tracked", label: "Tracked" },
  { key: "candidate", label: "Waiting to be checked" },
  { key: "rejected", label: "Rejected" },
];
const SOURCES: Record<string, string> = { discovery: "Topic search", sponsor: "Competitor mention" };

export default async function YouTube({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const f = { q: sp.q ?? "", status: sp.status ?? "tracked", source: sp.source ?? "", page: Math.max(1, Number(sp.page) || 1) };
  const [{ rows, total }, counts] = await Promise.all([listYoutubeChannels(f), youtubeStatusCounts()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (over: Partial<typeof f>) => `/youtube?${new URLSearchParams(Object.entries({ ...f, ...over }).map(([k, v]) => [k, String(v)]))}`;

  return (
    <>
      <h1>YouTube discovery</h1>
      <p className="sub">
        Channels found by topic searches or competitor mentions must pass every filter to be tracked: at least{" "}
        {DISCOVERY.minStrShare * 100}% of recent uploads about short-term rentals, {DISCOVERY.minUploads30d}+ uploads in
        30 days, and median views between {num(DISCOVERY.minMedianViews)} and {num(DISCOVERY.maxMedianViews)}. EV content
        isn't required; it's measured and filterable. At most {DISCOVERY.maxNewPerDay} new a day, {DISCOVERY.maxTracked} in total.
      </p>

      <div className="tabs">
        {STATUSES.map((s) => (
          <Link key={s.key} href={href({ status: s.key, page: 1 })} className={f.status === s.key ? "active" : ""}>
            {s.label} <span className="muted">{num(counts[s.key] ?? 0)}</span>
          </Link>
        ))}
      </div>

      <form className="filters">
        <input type="hidden" name="status" value={f.status} />
        <input name="q" placeholder="Search channel" defaultValue={f.q} />
        <select name="source" defaultValue={f.source}>
          <option value="">All sources</option>
          {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit">Filter</button>
      </form>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">
            {f.status === "tracked" && !f.q && !f.source
              ? "Nothing tracked yet. Channels appear after the nightly run."
              : "No channels match."}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num">STR uploads</th>
                <th className="num">EV uploads</th>
                <th className="num">Uploads 30d</th>
                <th className="num">Median views</th>
                <th className="num">Subscribers</th>
                <th>Found via</th>
                <th>Last upload</th>
                {f.status === "rejected" && <th>Why rejected</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.channelId}>
                  <td><Link href={`/youtube/${c.channelId}`}>{c.title ?? c.channelId}</Link></td>
                  <td className="num">{pct(c.strShare)}</td>
                  <td className="num">{pct(c.evShare)}</td>
                  <td className="num">{num(c.uploads30d)}</td>
                  <td className="num">{num(c.medianViews)}</td>
                  <td className="num">{num(c.subscriberCount)}</td>
                  <td className="muted">{SOURCES[c.source] ?? c.source}</td>
                  <td className="muted">{ago(c.lastUploadAt)}</td>
                  {f.status === "rejected" && <td className="muted">{c.rejectReason}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="pager">
        <span>{num(total)} channels · page {f.page} of {pages}</span>
        {f.page > 1 && <Link href={href({ page: f.page - 1 })}>← Prev</Link>}
        {f.page < pages && <Link href={href({ page: f.page + 1 })}>Next →</Link>}
      </div>
    </>
  );
}
