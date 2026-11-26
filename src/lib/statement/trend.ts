import { detectSubscriptions, type Subscription } from "./analyze";
import { monthlyTotals } from "./facts";
import type { CategoryId, Transaction } from "./types";

/**
 * "Önceki Aya Göre Değişim": tamamı kodla, kesin matematikle hesaplanır
 * (yapay zekâ rakam üretmez).
 */

export interface CategoryChange {
  category: CategoryId;
  previous: number;
  current: number;
  change: number;
  /** Önceki ay 0 ise null (yüzde tanımsız) */
  changePct: number | null;
}

export interface MonthComparison {
  currentMonth: string;
  previousMonth: string;
  /** Aylar ardışık değil (aradaki ay için ekstre yok) */
  gap: boolean;
  currentTotal: number;
  previousTotal: number;
  change: number;
  changePct: number | null;
  /** En çok artan en fazla 3 kategori (yalnızca artanlar) */
  topIncreases: CategoryChange[];
  /** İlk ödemesi son ayda görülen abonelikler (kesin olanlar için ≥2 ay şartı yüzünden "olası") */
  newSubscriptions: Subscription[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthsOf(txs: Transaction[]): string[] {
  return [...new Set(txs.filter((t) => t.kind === "debit").map((t) => t.date.slice(0, 7)))].sort();
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function compareLatestMonths(txs: Transaction[]): MonthComparison | null {
  const months = monthsOf(txs);
  if (months.length < 2) return null;
  const currentMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];

  const totals = new Map(monthlyTotals(txs).map((m) => [m.month, m]));
  const cur = totals.get(currentMonth)!;
  const prev = totals.get(previousMonth)!;

  const cats = new Set<CategoryId>([...(Object.keys(cur.byCategory) as CategoryId[])]);
  const topIncreases: CategoryChange[] = [];
  for (const category of cats) {
    const current = cur.byCategory[category] ?? 0;
    const previous = prev.byCategory[category] ?? 0;
    const change = round2(current - previous);
    if (change <= 0) continue;
    topIncreases.push({ category, previous, current, change, changePct: previous > 0 ? Math.round((change / previous) * 1000) / 10 : null });
  }
  topIncreases.sort((a, b) => b.change - a.change);

  const newSubscriptions = detectSubscriptions(txs).filter((s) => s.firstDate.startsWith(currentMonth));

  return {
    currentMonth,
    previousMonth,
    gap: nextMonth(previousMonth) !== currentMonth,
    currentTotal: cur.total,
    previousTotal: prev.total,
    change: round2(cur.total - prev.total),
    changePct: prev.total > 0 ? Math.round(((cur.total - prev.total) / prev.total) * 1000) / 10 : null,
    topIncreases: topIncreases.slice(0, 3),
    newSubscriptions,
  };
}
