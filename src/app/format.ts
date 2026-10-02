export function ago(d: Date | null | undefined): string {
  if (!d) return "never";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const num = (n: number | bigint | null | undefined) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US");

export const day = (d: Date) => d.toISOString().slice(0, 10);

/** Twitch content classification label ids, as people say them. */
const LABELS: Record<string, string> = {
  Gambling: "Gambling",
  MatureGame: "Mature game",
  DrugsIntoxication: "Drugs/alcohol",
  ProfanityVulgarity: "Profanity",
  SexualThemes: "Sexual themes",
  ViolentGraphic: "Graphic violence",
  DebatedSocialIssuesAndPolitics: "Politics",
};
export const labelName = (id: string) => LABELS[id] ?? id;

/** 0.034 → "3.4%"; "+5%" style with sign when signed. */
export const pct = (x: number | null | undefined, signed = false) =>
  x === null || x === undefined ? "—" : `${signed && x > 0 ? "+" : ""}${(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`;

/** 18300 → "18.3K". */
export const compact = (n: number | bigint | null | undefined) =>
  n === null || n === undefined ? "—" : Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n));
