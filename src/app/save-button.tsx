import { toggleSaved } from "./actions";

/** ★/☆ toggle for a YouTube channel. */
export function SaveButton({ id, saved, label = false }: { id: string; saved: boolean; label?: boolean }) {
  return (
    <form action={toggleSaved} className="save-form">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={`star ${saved ? "on" : ""}`} title={saved ? "Remove from watchlist" : "Save to watchlist"} aria-pressed={saved}>
        {saved ? "★" : "☆"}{label ? (saved ? " Saved" : " Save") : null}
      </button>
    </form>
  );
}
