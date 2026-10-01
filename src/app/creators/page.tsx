import Link from "next/link";
import { filterOptions, listCreators, PAGE_SIZE } from "../../lib/queries";
import { ago, num } from "../format";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

export default async function Creators({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const filters = {
    q: sp.q ?? "",
    title: sp.title ?? "",
    lang: sp.lang ?? "",
    page: Math.max(1, Number(sp.page) || 1),
  };
  const [{ rows, total }, opts] = await Promise.all([listCreators(filters), filterOptions()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/creators?${new URLSearchParams({ ...filters, page: String(p) })}`;

  return (
    <>
      <h1>Creators</h1>
      <p className="sub">
        Everyone the poller has seen on a target title, most recently seen first. Stream counts and average
        viewers cover the last 7 days on target titles only.
      </p>

      <form className="filters">
        <input name="q" placeholder="Search name" defaultValue={filters.q} />
        <select name="title" defaultValue={filters.title}>
          <option value="">All titles</option>
          {opts.titles.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select name="lang" defaultValue={filters.lang}>
          <option value="">All languages</option>
          {opts.langs.map((l) => <option key={l.language} value={l.language}>{l.language} ({l.n})</option>)}
        </select>
        <button type="submit">Filter</button>
        {(filters.q || filters.title || filters.lang) && <Link href="/creators" style={{ alignSelf: "center" }}>Clear</Link>}
      </form>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">No creators match.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Titles</th>
                <th>Lang</th>
                <th>Status</th>
                <th className="num">Streams</th>
                <th className="num">Avg viewers</th>
                <th>YouTube</th>
                <th>Last seen</th>
                <th>First seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/creators/${c.id}`}>{c.display_name}</Link></td>
                  <td>{(c.titles ?? []).map((t) => <span key={t} className="chip">{t}</span>)}</td>
                  <td>{c.language ?? "—"}</td>
                  <td className="muted">{c.broadcaster_type || "—"}</td>
                  <td className="num">{num(c.streams)}</td>
                  <td className="num">{num(c.avg_viewers)}</td>
                  <td>{c.has_youtube ? "✓" : <span className="muted">—</span>}</td>
                  <td className="muted">{ago(c.last_seen_at)}</td>
                  <td className="muted">{ago(c.first_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="pager">
        <span>{num(total)} creators · page {filters.page} of {pages}</span>
        {filters.page > 1 && <Link href={pageHref(filters.page - 1)}>← Prev</Link>}
        {filters.page < pages && <Link href={pageHref(filters.page + 1)}>Next →</Link>}
      </div>
    </>
  );
}
