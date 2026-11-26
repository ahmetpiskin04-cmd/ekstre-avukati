import { CATEGORIES } from "./categories";
import { monthsOf } from "./trend";
import type { CategoryId, Transaction } from "./types";

/** Aylık kategori bütçe limitleri (TL). localStorage'da saklanır. */
export type Budgets = Partial<Record<CategoryId, number>>;

export const WARN_RATIO = 0.8;

export type BudgetLevel = "ok" | "warn" | "over";

export interface BudgetStatus {
  category: CategoryId;
  limit: number;
  spent: number;
  /** spent / limit */
  ratio: number;
  level: BudgetLevel;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function budgetLevel(spent: number, limit: number): BudgetLevel {
  if (limit <= 0) return "ok";
  const ratio = spent / limit;
  if (ratio >= 1) return "over";
  if (ratio >= WARN_RATIO) return "warn";
  return "ok";
}

export function latestMonth(txs: Transaction[]): string | null {
  const months = monthsOf(txs);
  return months[months.length - 1] ?? null;
}

export function monthSpending(txs: Transaction[], month: string | null): Partial<Record<CategoryId, number>> {
  const out: Partial<Record<CategoryId, number>> = {};
  if (!month) return out;
  for (const t of txs) {
    if (t.kind !== "debit" || !t.date.startsWith(month)) continue;
    out[t.category] = round2((out[t.category] ?? 0) + t.amount);
  }
  return out;
}

/** Limiti tanımlı her kategori için son ayın durumu; en doluluk oranı yüksek olan başta. */
export function budgetStatuses(txs: Transaction[], budgets: Budgets, month: string | null = latestMonth(txs)): BudgetStatus[] {
  const spending = monthSpending(txs, month);
  const out: BudgetStatus[] = [];
  for (const [category, limit] of Object.entries(budgets) as Array<[CategoryId, number]>) {
    if (!(category in CATEGORIES) || !(limit > 0)) continue;
    const spent = spending[category] ?? 0;
    out.push({ category, limit, spent, ratio: spent / limit, level: budgetLevel(spent, limit) });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

export const alertingBudgets = (statuses: BudgetStatus[]) => statuses.filter((s) => s.level !== "ok");

/** "5.000", "5000", "5000,50", "₺5.000 TL" → sayı; geçersiz/boş/≤0 → null. */
export function parseLimit(input: string): number | null {
  const s = input.replace(/[₺\s]|TL|TRY/gi, "");
  if (!s || !/^\d[\d.,]*$/.test(s)) return null;
  let normalized: string;
  if (s.includes(",")) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, "");
  else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 && n < 1e9 ? round2(n) : null;
}

/** localStorage'dan gelen değeri güvenle Budgets'a çevirir. */
export function sanitizeBudgets(raw: unknown): Budgets {
  const out: Budgets = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k in CATEGORIES && typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e9) out[k as CategoryId] = round2(v);
  }
  return out;
}
