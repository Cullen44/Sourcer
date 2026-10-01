import Link from "next/link";
import { filterOptions, listCreators, PAGE_SIZE, type CreatorRow, type Platform } from "../../lib/queries";
import { ago, num } from "../format";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: "all", label: "All" },
  { key: "twitch", label: "Twitch" },
  { key: "youtube", label: "YouTube" },
];

export default async function Creators({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const platform = (["all", "twitch", "youtube"].includes(sp.platform ?? "") ? sp.platform : "all") as Platform;
  const filters = {
    q: sp.q ?? "",
    title: sp.title ?? "",
    // YouTube doesn't report channel language, so the filter only applies to Twitch.
    lang: platform === "youtube" ? "" : (sp.lang ?? ""),
    platform,
    page: Math.max(1, Number(sp.page) || 1),
  };
  const [{ rows, total }, opts] = await Promise.all([listCreators(filters), filterOptions()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (over: Partial<typeof filters>) =>
    `/creators?${new URLSearchParams(Object.entries({ ...filters, ...over }).map(([k, v]) => [k, String(v)]))}`;
  const anyFilter = filters.q || filters.title || filters.lang;

  return (
    <>
      <h1>Creators</h1>
      <p className="sub">
        Twitch creators seen on a target title, and YouTube channels that passed discovery. Most recently active first.
        Twitch figures cover the last 7 days on target titles; YouTube figures cover recent uploads.
      </p>

      <div className="tabs">
        {PLATFORMS.map((p) => (
          <Link key={p.key} href={href({ platform: p.key, page: 1, ...(p.key === "youtube" ? { lang: "" } : {}) })} className={platform === p.key ? "active" : ""}>
            {p.label}
          </Link>
        ))}
      </div>

      <form className="filters">
        <input type="hidden" name="platform" value={platform} />
        <input name="q" placeholder="Search name" defaultValue={filters.q} />
        <select name="title" defaultValue={filters.title}>
          <option value="">All titles</option>
          {opts.titles.map((t) => <option key={t}>{t}</option>)}
        </select>
        {platform !== "youtube" && (
          <select name="lang" defaultValue={filters.lang}>
            <option value="">All languages</option>
            {opts.langs.map((l) => <option key={l.language} value={l.language}>{l.language} ({l.n})</option>)}
          </select>
        )}
        <button type="submit">Filter</button>
        {anyFilter && <Link href={`/creators?platform=${platform}`} style={{ alignSelf: "center" }}>Clear</Link>}
      </form>
      {platform === "all" && filters.lang && (
        <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>Language filter applies to Twitch only, so YouTube-only channels are hidden.</p>
      )}

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">No creators match.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Platforms</th>
                <th>Titles</th>
                <th className="num">Twitch avg viewers</th>
                <th className="num">Twitch streams 7d</th>
                <th className="num">YouTube median views</th>
                <th className="num">YouTube uploads 30d</th>
                <th>Lang</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => <Row key={`${c.platform}-${c.key}`} c={c} />)}
            </tbody>
          </table>
        )}
      </div>

      <div className="pager">
        <span>{num(total)} creators · page {filters.page} of {pages}</span>
        {filters.page > 1 && <Link href={href({ page: filters.page - 1 })}>← Prev</Link>}
        {filters.page < pages && <Link href={href({ page: filters.page + 1 })}>Next →</Link>}
      </div>
    </>
  );
}

function Row({ c }: { c: CreatorRow }) {
  const hasTwitch = c.twitch_id !== null;
  const hasYoutube = c.yt_channel_id !== null;
  // Twitch rows open the Twitch page (which links to YouTube); YouTube-only rows open the channel page.
  const link = c.platform === "twitch" ? `/creators/${c.twitch_id}` : `/youtube/${c.yt_channel_id}`;
  const titles = [...new Set(c.titles ?? [])];

  return (
    <tr>
      <td><Link href={link}>{c.name}</Link></td>
      <td style={{ whiteSpace: "nowrap" }}>
        {hasTwitch && <Link href={`/creators/${c.twitch_id}`} className="badge twitch">Twitch</Link>}
        {hasYoutube && <Link href={`/youtube/${c.yt_channel_id}`} className="badge youtube">YouTube</Link>}
      </td>
      <td>{titles.length ? titles.map((t) => <span key={t} className="chip">{t}</span>) : <span className="muted">—</span>}</td>
      <td className="num">{hasTwitch && c.platform === "twitch" ? num(c.avg_viewers) : <span className="muted">—</span>}</td>
      <td className="num">{hasTwitch && c.platform === "twitch" ? num(c.streams) : <span className="muted">—</span>}</td>
      <td className="num">{hasYoutube ? num(c.yt_median_views) : <span className="muted">—</span>}</td>
      <td className="num">{hasYoutube ? num(c.yt_uploads_30d) : <span className="muted">—</span>}</td>
      <td>{c.language ?? <span className="muted">—</span>}</td>
      <td className="muted">{ago(c.last_active)}</td>
    </tr>
  );
}
