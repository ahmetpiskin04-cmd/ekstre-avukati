const tl = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tlShort = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 0 });
const dayMonth = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const full = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });

export const formatTL = (n: number) => tl.format(n);
export const formatTLShort = (n: number) => tlShort.format(n);
export const formatPct = (n: number) => pct.format(n);

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const formatDay = (iso: string) => dayMonth.format(d(iso));
export const formatDate = (iso: string) => full.format(d(iso));
export const formatMonth = (iso: string) => monthYear.format(d(iso));

/** "2026-10" -> "Ekim 2026" */
export const formatYM = (ym: string) => formatMonth(`${ym}-01`);

/** 12.5 / -3 -> "+%12,5" / "-%3" */
export function formatSignedPct(n: number): string {
  return `${n >= 0 ? "+" : "-"}%${Math.abs(n).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
}

export function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  const a = formatMonth(start);
  const b = formatMonth(end);
  return a === b ? a : `${a} – ${b}`;
}
