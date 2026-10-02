import { canRun, JOBS, jobsConfigured, lastRun, type LastRun } from "../lib/jobs";
import { runJob } from "./actions";
import { ago } from "./format";

/** "Run now" buttons for the GitHub workflows, with each one's latest run. */
export async function RunPanel({ ran, runErr }: { ran?: string; runErr?: string }) {
  if (!jobsConfigured()) {
    return (
      <div className="note-box">
        <strong>Run buttons are off.</strong> To start jobs from here, create a GitHub token at{" "}
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">github.com/settings/personal-access-tokens/new</a>{" "}
        (repository access: only <code>Cullen44/Sourcer</code>; permissions: Actions → Read and write), then add a line{" "}
        <code>GITHUB_TOKEN=&quot;…&quot;</code> to your <code>.env</code> and restart the viewer.
      </div>
    );
  }

  const rows = await Promise.all(
    JOBS.map(async (job) => {
      try {
        const last = await lastRun(job);
        return { job, last, check: canRun(job, last), error: null as string | null };
      } catch (err) {
        return { job, last: null as LastRun | null, check: { ok: false as const, reason: "GitHub unreachable" }, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  return (
    <>
      {ran && <div className="note-box ok" style={{ marginBottom: 8 }}>Started <strong>{ran}</strong>. It shows as queued below; refresh in a minute or two for the result.</div>}
      {runErr && <div className="note-box bad" style={{ marginBottom: 8 }}>Couldn't start: {runErr}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Job</th><th>Latest run</th><th></th></tr></thead>
          <tbody>
            {rows.map(({ job, last, check, error }) => (
              <tr key={job.file}>
                <td>
                  <strong>{job.label}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>{job.what}</div>
                </td>
                <td style={{ fontSize: 13 }}>
                  {error ? <span className="bad" title={error}>can't reach GitHub</span> : last ? (
                    <a href={last.url} target="_blank" rel="noreferrer">
                      <RunStatus last={last} />
                    </a>
                  ) : <span className="muted">never run</span>}
                  {last && <div className="muted" style={{ fontSize: 12 }}>{ago(last.createdAt)} · {last.event === "schedule" ? "scheduled" : "manual"}</div>}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <form action={runJob}>
                    <input type="hidden" name="file" value={job.file} />
                    <button type="submit" className="run-btn" disabled={!check.ok} title={check.ok ? `Start ${job.label} now` : check.reason}>
                      Run now
                    </button>
                  </form>
                  {!check.ok && <div className="muted" style={{ fontSize: 12 }}>{check.reason}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RunStatus({ last }: { last: LastRun }) {
  if (last.status !== "completed") return <span className="warn">● {last.status.replace("_", " ")}</span>;
  if (last.conclusion === "success") return <span className="ok">✓ succeeded</span>;
  if (last.conclusion === "skipped") return <span className="muted">skipped</span>;
  return <span className="bad">✕ {last.conclusion ?? "failed"}</span>;
}
