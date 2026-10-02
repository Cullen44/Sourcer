import { toggleSaved } from "./actions";

/** ★/☆ toggle. kind "twitch" takes a creators.id; "youtube" a channel ID. */
export function SaveButton({ kind, id, saved, label = false }: { kind: "twitch" | "youtube"; id: string | number; saved: boolean; label?: boolean }) {
  return (
    <form action={toggleSaved} className="save-form">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={String(id)} />
      <button type="submit" className={`star ${saved ? "on" : ""}`} title={saved ? "Remove from watchlist" : "Save to watchlist"} aria-pressed={saved}>
        {saved ? "★" : "☆"}{label ? (saved ? " Saved" : " Save") : null}
      </button>
    </form>
  );
}
