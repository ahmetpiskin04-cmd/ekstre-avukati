import { monthlyTotals } from "./facts";
import { monthsOf } from "./trend";
import type { CategoryId, Transaction } from "./types";

/**
 * KPI kartlarının altındaki "önceki aya göre" etiketleri (yalnızca görünüm için türetilir;
 * mevcut aylık toplamları kullanır, yeni bir iş kuralı eklemez).
 * Değer: yüzde değişim; önceki ay 0 ise null ("yeni"); karşılaştırılacak ay yoksa undefined.
 */
export interface KpiTrends {
  currentMonth: string;
  previousMonth: string;
  total: number | null;
  /** "Abonelik" (dijital) kategorisindeki değişim */
  subscriptions: number | null | undefined;
  /** Banka kesintisi kategorisindeki değişim */
  fees: number | null | undefined;
  category: (c: CategoryId) => number | null | undefined;
}

const pct = (prev: number, cur: number): number | null | undefined => {
  if (prev === 0 && cur === 0) return undefined;
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
};

export function kpiTrends(txs: Transaction[]): KpiTrends | null {
  const months = monthsOf(txs);
  if (months.length < 2) return null;
  const currentMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];
  const byMonth = new Map(monthlyTotals(txs).map((m) => [m.month, m]));
  const cur = byMonth.get(currentMonth)!;
  const prev = byMonth.get(previousMonth)!;
  const category = (c: CategoryId) => pct(prev.byCategory[c] ?? 0, cur.byCategory[c] ?? 0);
  return {
    currentMonth,
    previousMonth,
    total: pct(prev.total, cur.total) ?? null,
    subscriptions: category("dijital"),
    fees: category("banka"),
    category,
  };
}
