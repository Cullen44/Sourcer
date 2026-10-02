import Link from "next/link";
import { filterOptions, listCreators, PAGE_SIZE, type CreatorRow, type Platform } from "../../lib/queries";
import { ago, compact, labelName, num, pct } from "../format";
import { SaveButton } from "../save-button";

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
  const int = (v: string | undefined) => (v && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
  const dec = (v: string | undefined) => (v && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : null);
  const showTwitch = platform !== "youtube";
  const showYoutube = platform !== "twitch";
  const filters = {
    q: sp.q ?? "",
    title: sp.title ?? "",
    // YouTube doesn't report channel language, so the filter only applies to Twitch.
    lang: showTwitch ? (sp.lang ?? "") : "",
    platform,
    page: Math.max(1, Number(sp.page) || 1),
    twitchViewersMin: showTwitch ? int(sp.twitchViewersMin) : null,
    twitchViewersMax: showTwitch ? int(sp.twitchViewersMax) : null,
    twitchStreamsMin: showTwitch ? int(sp.twitchStreamsMin) : null,
    ytViewsMin: showYoutube ? int(sp.ytViewsMin) : null,
    ytViewsMax: showYoutube ? int(sp.ytViewsMax) : null,
    ytUploadsMin: showYoutube ? int(sp.ytUploadsMin) : null,
    activeDays: int(sp.activeDays),
    savedOnly: sp.saved === "1",
    followersMin: showTwitch ? int(sp.followersMin) : null,
    followersMax: showTwitch ? int(sp.followersMax) : null,
    followerGrowthMin: showTwitch ? dec(sp.followerGrowthMin) : null,
    clipsMin: showTwitch ? int(sp.clipsMin) : null,
    clipViewsMin: showTwitch ? int(sp.clipViewsMin) : null,
    label: showTwitch && /^(none|[+-]\w+)$/.test(sp.label ?? "") ? sp.label! : "",
    ytEngagementMin: showYoutube ? dec(sp.ytEngagementMin) : null,
  };
  const [{ rows, total }, opts] = await Promise.all([listCreators(filters), filterOptions()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (over: Partial<typeof filters>) =>
    `/creators?${new URLSearchParams(
      Object.entries({ ...filters, ...over }).flatMap(([k, v]) =>
        k === "savedOnly" ? (v ? [["saved", "1"]] : []) : v === null || v === "" ? [] : [[k, String(v)]],
      ),
    )}`;
  const numericSet = [
    filters.twitchViewersMin, filters.twitchViewersMax, filters.twitchStreamsMin, filters.ytViewsMin, filters.ytViewsMax, filters.ytUploadsMin, filters.activeDays,
    filters.followersMin, filters.followersMax, filters.followerGrowthMin, filters.clipsMin, filters.clipViewsMin, filters.ytEngagementMin,
  ].some((v) => v !== null) || filters.label !== "";
  const anyFilter = filters.q || filters.title || filters.lang || numericSet || filters.savedOnly;
  const numInput = (name: keyof typeof filters, placeholder: string, step?: string) => (
    <input name={name} type="number" min={step ? undefined : 0} step={step} inputMode={step ? "decimal" : "numeric"} placeholder={placeholder} defaultValue={filters[name] === null ? "" : String(filters[name])} className="num-input" />
  );

  return (
    <>
      <h1>Creators</h1>
      <p className="sub">
        Twitch creators seen on a target title, and YouTube channels that passed discovery. Most recently active first.
        Twitch viewers and streams cover the last 7 days on target titles; followers, clips and labels are refreshed daily. YouTube figures cover recent uploads.
      </p>

      <div className="tabs">
        {PLATFORMS.map((p) => (
          <Link key={p.key} href={href({ platform: p.key, page: 1 })} className={platform === p.key ? "active" : ""}>
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
        {showTwitch && (
          <select name="lang" defaultValue={filters.lang}>
            <option value="">All languages</option>
            {opts.langs.map((l) => <option key={l.language} value={l.language}>{l.language} ({l.n})</option>)}
          </select>
        )}
        <label className="check">
          <input type="checkbox" name="saved" value="1" defaultChecked={filters.savedOnly} /> Saved only
        </label>
        <select name="activeDays" defaultValue={filters.activeDays === null ? "" : String(filters.activeDays)}>
          <option value="">Active any time</option>
          <option value="1">Active in last day</option>
          <option value="3">Active in last 3 days</option>
          <option value="7">Active in last 7 days</option>
          <option value="30">Active in last 30 days</option>
        </select>
        <div className="filter-row">
          {showTwitch && (
            <fieldset>
              <legend>Twitch</legend>
              <label>Avg viewers {numInput("twitchViewersMin", "min")} – {numInput("twitchViewersMax", "max")}</label>
              <label>Streams 7d ≥ {numInput("twitchStreamsMin", "min")}</label>
              <label>Followers {numInput("followersMin", "min")} – {numInput("followersMax", "max")}</label>
              <label>Follower growth 7d ≥ {numInput("followerGrowthMin", "%", "0.1")}%</label>
              <label>Clips 30d ≥ {numInput("clipsMin", "min")}</label>
              <label>Clip views 30d ≥ {numInput("clipViewsMin", "min")}</label>
              <label>
                Content label{" "}
                <select name="label" defaultValue={filters.label}>
                  <option value="">Any</option>
                  <option value="none">No labels</option>
                  <optgroup label="Has">
                    {opts.labels.map((l) => <option key={`+${l.label}`} value={`+${l.label}`}>{labelName(l.label)} ({l.n})</option>)}
                  </optgroup>
                  <optgroup label="Doesn't have">
                    {opts.labels.map((l) => <option key={`-${l.label}`} value={`-${l.label}`}>No {labelName(l.label)}</option>)}
                  </optgroup>
                </select>
              </label>
            </fieldset>
          )}
          {showYoutube && (
            <fieldset>
              <legend>YouTube</legend>
              <label>Median views {numInput("ytViewsMin", "min")} – {numInput("ytViewsMax", "max")}</label>
              <label>Uploads 30d ≥ {numInput("ytUploadsMin", "min")}</label>
              <label>Engagement ≥ {numInput("ytEngagementMin", "%", "0.1")}%</label>
            </fieldset>
          )}
          <button type="submit">Filter</button>
          {anyFilter && <Link href={`/creators?platform=${platform}`} style={{ alignSelf: "center" }}>Clear</Link>}
        </div>
      </form>
      {platform === "all" && numericSet && (
        <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          A Twitch number filter only matches creators with Twitch data, and a YouTube one only creators with a tracked YouTube channel.
        </p>
      )}
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
                <th></th>
                <th>Creator</th>
                <th>Platforms</th>
                <th>Titles</th>
                <th className="num">Twitch avg viewers</th>
                <th className="num">Twitch streams 7d</th>
                <th className="num" title="Change over the last 7 days, once a week of daily snapshots exists">Twitch followers</th>
                <th className="num" title="Clips made of the channel in the last 30 days, and their views">Twitch clips 30d</th>
                <th>Twitch labels</th>
                <th className="num">YouTube median views</th>
                <th className="num">YouTube uploads 30d</th>
                <th className="num" title="Median (likes + comments) / views per recent upload">YouTube engagement</th>
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
      <td style={{ width: 28 }}>
        {c.platform === "twitch" ? <SaveButton kind="twitch" id={c.twitch_id!} saved={c.saved} /> : <SaveButton kind="youtube" id={c.yt_channel_id!} saved={c.saved} />}
      </td>
      <td><Link href={link}>{c.name}</Link></td>
      <td style={{ whiteSpace: "nowrap" }}>
        {hasTwitch && <Link href={`/creators/${c.twitch_id}`} className="badge twitch">Twitch</Link>}
        {hasYoutube && <Link href={`/youtube/${c.yt_channel_id}`} className="badge youtube">YouTube</Link>}
      </td>
      <td>{titles.length ? titles.map((t) => <span key={t} className="chip">{t}</span>) : <span className="muted">—</span>}</td>
      <td className="num">{hasTwitch && c.platform === "twitch" ? num(c.avg_viewers) : <span className="muted">—</span>}</td>
      <td className="num">{hasTwitch && c.platform === "twitch" ? num(c.streams) : <span className="muted">—</span>}</td>
      <td className="num" style={{ whiteSpace: "nowrap" }}>
        {c.platform === "twitch" && c.followers !== null ? (
          <>
            {num(c.followers)}
            {c.followers_growth !== null && (
              <div className={c.followers_growth > 0 ? "up" : c.followers_growth < 0 ? "down" : "muted"} style={{ fontSize: 12 }}>{pct(c.followers_growth, true)} 7d</div>
            )}
          </>
        ) : <span className="muted">—</span>}
      </td>
      <td className="num" style={{ whiteSpace: "nowrap" }}>
        {c.platform === "twitch" && c.clips_30d !== null ? (
          <>
            {c.clips_30d >= 500 ? "500+" : num(c.clips_30d)}
            {c.clips_30d > 0 && <div className="muted" style={{ fontSize: 12 }}>{compact(c.clip_views_30d)} views</div>}
          </>
        ) : <span className="muted">—</span>}
      </td>
      <td>
        {c.branded && <span className="chip warn" title="Channel flags branded content">Branded</span>}
        {(c.labels ?? []).map((l) => <span key={l} className="chip">{labelName(l)}</span>)}
        {!c.branded && (c.labels ?? []).length === 0 && <span className="muted">—</span>}
      </td>
      <td className="num">{hasYoutube ? num(c.yt_median_views) : <span className="muted">—</span>}</td>
      <td className="num">{hasYoutube ? num(c.yt_uploads_30d) : <span className="muted">—</span>}</td>
      <td className="num">{hasYoutube ? pct(c.yt_engagement) : <span className="muted">—</span>}</td>
      <td>{c.language ?? <span className="muted">—</span>}</td>
      <td className="muted">{ago(c.last_active)}</td>
    </tr>
  );
}
