import Link from "next/link";
import { TARGET_TITLES } from "../../config/games";
import { DISCOVERY } from "../../config/youtube";
import { listYoutubeChannels, PAGE_SIZE, youtubeStatusCounts } from "../../lib/queries";
import { ago, num } from "../format";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

const STATUSES = [
  { key: "tracked", label: "Tracked" },
  { key: "candidate", label: "Waiting to be checked" },
  { key: "rejected", label: "Rejected" },
];
const SOURCES: Record<string, string> = { discovery: "Search", twitch_link: "Twitch bio", sponsor: "Sponsor code" };

export default async function YouTube({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const f = { q: sp.q ?? "", title: sp.title ?? "", status: sp.status ?? "tracked", source: sp.source ?? "", page: Math.max(1, Number(sp.page) || 1) };
  const [{ rows, total }, counts] = await Promise.all([listYoutubeChannels(f), youtubeStatusCounts()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (over: Partial<typeof f>) => `/youtube?${new URLSearchParams(Object.entries({ ...f, ...over }).map(([k, v]) => [k, String(v)]))}`;

  return (
    <>
      <h1>YouTube discovery</h1>
      <p className="sub">
        Channels found by title searches must pass every filter to be tracked: at least {DISCOVERY.minTitleShare * 100}% of
        recent uploads on target titles, {DISCOVERY.minUploads30d}+ uploads in 30 days, and median views between{" "}
        {num(DISCOVERY.minMedianViews)} and {num(DISCOVERY.maxMedianViews)}. At most {DISCOVERY.maxNewPerDay} new a day,{" "}
        {DISCOVERY.maxTracked} in total. Channels linked from a Twitch bio are tracked without filters.
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
        <select name="title" defaultValue={f.title}>
          <option value="">All titles</option>
          {TARGET_TITLES.map((t) => <option key={t.canonicalTitle}>{t.canonicalTitle}</option>)}
        </select>
        <select name="source" defaultValue={f.source}>
          <option value="">All sources</option>
          {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit">Filter</button>
      </form>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">
            {f.status === "tracked" && !f.q && !f.title && !f.source
              ? "Nothing tracked yet. Channels appear after the nightly run."
              : "No channels match."}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Main title</th>
                <th className="num">On-title</th>
                <th className="num">Uploads 30d</th>
                <th className="num">Median views</th>
                <th className="num">Subscribers</th>
                <th>Found via</th>
                <th>Twitch</th>
                <th>Last upload</th>
                {f.status === "rejected" && <th>Why rejected</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.channelId}>
                  <td><Link href={`/youtube/${c.channelId}`}>{c.title ?? c.channelId}</Link></td>
                  <td>{c.primaryTitle ? <span className="chip">{c.primaryTitle}</span> : <span className="muted">—</span>}</td>
                  <td className="num">{c.titleShare === null ? "—" : `${Math.round(c.titleShare * 100)}%`}</td>
                  <td className="num">{num(c.uploads30d)}</td>
                  <td className="num">{num(c.medianViews)}</td>
                  <td className="num">{num(c.subscriberCount)}</td>
                  <td className="muted">{SOURCES[c.source] ?? c.source}</td>
                  <td>{c.creator ? <Link href={`/creators/${c.creator.id}`}>{c.creator.displayName}</Link> : <span className="muted">—</span>}</td>
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
