import Link from "next/link";
import { listCreators, PAGE_SIZE, type CreatorRow } from "../../lib/queries";
import { ago, compact, num, pct } from "../format";
import { SaveButton } from "../save-button";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

const EV_TABS = [
  { key: "any", label: "All" },
  { key: "ev", label: "Cover EVs" },
  { key: "none", label: "No EV content" },
];

export default async function Creators({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const int = (v: string | undefined) => (v && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
  const dec = (v: string | undefined) => (v && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : null);
  const filters = {
    q: sp.q ?? "",
    page: Math.max(1, Number(sp.page) || 1),
    ev: EV_TABS.some((t) => t.key === sp.ev) ? sp.ev! : "any",
    evShareMin: dec(sp.evShareMin),
    strShareMin: dec(sp.strShareMin),
    subsMin: int(sp.subsMin),
    subsMax: int(sp.subsMax),
    viewsMin: int(sp.viewsMin),
    viewsMax: int(sp.viewsMax),
    uploadsMin: int(sp.uploadsMin),
    engagementMin: dec(sp.engagementMin),
    activeDays: int(sp.activeDays),
    savedOnly: sp.saved === "1",
    mentionsOnly: sp.mentions === "1",
  };
  const { rows, total } = await listCreators(filters);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (over: Partial<typeof filters>) =>
    `/creators?${new URLSearchParams(
      Object.entries({ ...filters, ...over }).flatMap(([k, v]) =>
        k === "savedOnly" ? (v ? [["saved", "1"]] : []) : k === "mentionsOnly" ? (v ? [["mentions", "1"]] : []) : v === null || v === "" ? [] : [[k, String(v)]],
      ),
    )}`;
  const anyFilter =
    filters.q || filters.savedOnly || filters.mentionsOnly ||
    [filters.evShareMin, filters.strShareMin, filters.subsMin, filters.subsMax, filters.viewsMin, filters.viewsMax, filters.uploadsMin, filters.engagementMin, filters.activeDays].some((v) => v !== null);
  const numInput = (name: keyof typeof filters, placeholder: string, step?: string) => (
    <input name={name} type="number" min={0} step={step} inputMode={step ? "decimal" : "numeric"} placeholder={placeholder}
      defaultValue={filters[name] === null ? "" : String(filters[name])} className="num-input" />
  );

  return (
    <>
      <h1>Creators</h1>
      <p className="sub">
        YouTube channels that passed discovery: they post about hosting short-term rentals. Channels covering EVs come
        first. Figures cover recent uploads and refresh nightly.
      </p>

      <div className="tabs">
        {EV_TABS.map((t) => (
          <Link key={t.key} href={href({ ev: t.key, page: 1 })} className={filters.ev === t.key ? "active" : ""}>{t.label}</Link>
        ))}
      </div>

      <form className="filters">
        <input type="hidden" name="ev" value={filters.ev} />
        <input name="q" placeholder="Search channel" defaultValue={filters.q} />
        <label className="check"><input type="checkbox" name="saved" value="1" defaultChecked={filters.savedOnly} /> Saved only</label>
        <label className="check"><input type="checkbox" name="mentions" value="1" defaultChecked={filters.mentionsOnly} /> Mentions a competitor</label>
        <select name="activeDays" defaultValue={filters.activeDays === null ? "" : String(filters.activeDays)}>
          <option value="">Uploaded any time</option>
          <option value="7">Uploaded in last 7 days</option>
          <option value="30">Uploaded in last 30 days</option>
          <option value="90">Uploaded in last 90 days</option>
        </select>
        <div className="filter-row">
          <fieldset>
            <legend>Topics</legend>
            <label>STR uploads ≥ {numInput("strShareMin", "%", "1")}%</label>
            <label>EV uploads ≥ {numInput("evShareMin", "%", "1")}%</label>
          </fieldset>
          <fieldset>
            <legend>Audience</legend>
            <label>Subscribers {numInput("subsMin", "min")} – {numInput("subsMax", "max")}</label>
            <label>Median views {numInput("viewsMin", "min")} – {numInput("viewsMax", "max")}</label>
            <label>Uploads 30d ≥ {numInput("uploadsMin", "min")}</label>
            <label>Engagement ≥ {numInput("engagementMin", "%", "0.1")}%</label>
          </fieldset>
          <button type="submit">Filter</button>
          {anyFilter && <Link href={`/creators?ev=${filters.ev}`} style={{ alignSelf: "center" }}>Clear</Link>}
        </div>
      </form>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <div className="empty">{anyFilter || filters.ev !== "any" ? "No creators match." : "Nothing tracked yet. Channels appear after the nightly run."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Channel</th>
                <th className="num" title="Share of recent uploads about short-term rentals">STR uploads</th>
                <th className="num" title="Share of recent uploads mentioning EVs or EV charging">EV uploads</th>
                <th className="num">Subscribers</th>
                <th className="num">Median views</th>
                <th className="num">Uploads 30d</th>
                <th className="num" title="Median (likes + comments) / views per recent upload">Engagement</th>
                <th className="num">Competitor mentions</th>
                <th>Last upload</th>
              </tr>
            </thead>
            <tbody>{rows.map((c) => <Row key={c.channel_id} c={c} />)}</tbody>
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
  return (
    <tr>
      <td style={{ width: 28 }}><SaveButton id={c.channel_id} saved={c.saved} /></td>
      <td>
        <Link href={`/youtube/${c.channel_id}`}>{c.name}</Link>
        {c.handle && <div className="muted" style={{ fontSize: 12 }}>{c.handle}{c.country ? ` · ${c.country}` : ""}</div>}
      </td>
      <td className="num">{pct(c.str_share)}</td>
      <td className="num">{c.ev_share ? <span className="chip">{pct(c.ev_share)}</span> : <span className="muted">—</span>}</td>
      <td className="num">{compact(c.subscribers)}</td>
      <td className="num">{num(c.median_views)}</td>
      <td className="num">{num(c.uploads_30d)}</td>
      <td className="num">{pct(c.engagement)}</td>
      <td className="num">{c.mentions ? <span className="warn">{c.mentions}</span> : <span className="muted">—</span>}</td>
      <td className="muted">{ago(c.last_upload)}</td>
    </tr>
  );
}
