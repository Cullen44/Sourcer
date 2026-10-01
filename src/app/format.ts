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
