"use client";

import { Plus, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { setBudget, useBudgets } from "@/lib/client/stores";
import { formatPct, formatTL, formatTLShort, formatYM } from "@/lib/format";
import { alertingBudgets, budgetLevel, budgetStatuses, latestMonth, monthSpending, parseLimit, WARN_RATIO, type BudgetLevel, type BudgetStatus } from "@/lib/statement/budget";
import { CATEGORIES } from "@/lib/statement/categories";
import type { CategoryId, Transaction } from "@/lib/statement/types";
import { Card, cn } from "./ui";

/** Dolgu: zümrüt (normal) → kehribar (%80+) → mercan (aşım); hafif parlama ile. */
const LEVEL_BAR: Record<BudgetLevel, string> = {
  ok: "bg-brand",
  warn: "bg-warn-fill shadow-[0_0_10px_rgba(245,158,11,0.45)]",
  over: "bg-bad-fill shadow-[0_0_10px_rgba(244,63,94,0.5)]",
};
/** Varsayılan olarak gösterilen kategori sayısı (limiti olanlar her zaman görünür) */
const VISIBLE = 5;

const LEVEL_TEXT: Record<BudgetLevel, string> = { ok: "text-ink-2", warn: "text-warn", over: "text-bad" };

/** Doluluk çubuğu: %80'de uyarı eşiği işareti; %100 üstü çubuk dolu gösterilir. */
export function BudgetBar({ spent, limit, level }: { spent: number; limit: number; level: BudgetLevel }) {
  const ratio = limit > 0 ? spent / limit : 0;
  return (
    <div
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.round(ratio * 100))}
      aria-label={`Bütçe kullanımı ${formatPct(ratio)}`}
    >
      <div
        className={cn("animate-grow-x h-full rounded-full transition-[width,background-color] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]", LEVEL_BAR[level])}
        style={{ width: `${Math.min(100, ratio * 100)}%` }}
      />
      <span aria-hidden className="absolute inset-y-0 w-[2px] bg-surface" style={{ left: `${WARN_RATIO * 100}%` }} />
    </div>
  );
}

/** Dashboard'un üstünde: yalnızca %80'i geçen veya aşan kategoriler. */
export function BudgetAlerts({ transactions }: { transactions: Transaction[] }) {
  const budgets = useBudgets();
  const month = latestMonth(transactions);
  const alerts = useMemo(() => alertingBudgets(budgetStatuses(transactions, budgets, month)), [transactions, budgets, month]);
  if (!month || alerts.length === 0) return null;
  const overCount = alerts.filter((a) => a.level === "over").length;
  const warnCount = alerts.length - overCount;
  const headline = [overCount && `${overCount} kategoride limit aşıldı`, warnCount && `${warnCount} kategori limite yaklaştı (%${WARN_RATIO * 100}+)`].filter(Boolean).join(", ");

  return (
    <section aria-label="Bütçe uyarıları" className={cn(
        "rounded-[28px] p-5 shadow-card",
        overCount ? "bg-bad-fill/10" : "bg-warn-fill/10",
      )}>
      <p className={cn("flex items-center gap-2 text-sm font-semibold", overCount ? "text-bad" : "text-warn")}>
        <Target className="size-4" />
        Bütçe uyarısı · {formatYM(month)}: {headline}
      </p>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {alerts.map((a) => (
          <AlertRow key={a.category} a={a} />
        ))}
      </ul>
    </section>
  );
}

function AlertRow({ a }: { a: BudgetStatus }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-ink">{CATEGORIES[a.category].label}</span>
        <span className={cn("tabular text-xs font-semibold", LEVEL_TEXT[a.level])}>
          {formatTLShort(a.spent)} / {formatTLShort(a.limit)} · {formatPct(a.ratio)}
          {a.level === "over" && ` (+${formatTLShort(a.spent - a.limit)} aşım)`}
        </span>
      </div>
      <div className="mt-1.5">
        <BudgetBar spent={a.spent} limit={a.limit} level={a.level} />
      </div>
    </li>
  );
}

/** Kategori bütçe limitlerini düzenleme paneli (son aya göre). */
export function BudgetPanel({ transactions }: { transactions: Transaction[] }) {
  const budgets = useBudgets();
  const [extra, setExtra] = useState<CategoryId[]>([]);
  const [showAll, setShowAll] = useState(false);
  const month = latestMonth(transactions);
  const spending = useMemo(() => monthSpending(transactions, month), [transactions, month]);

  const shown = useMemo(() => {
    const ids = new Set<CategoryId>([...(Object.keys(spending) as CategoryId[]), ...(Object.keys(budgets) as CategoryId[]), ...extra]);
    return [...ids].sort((a, b) => (spending[b] ?? 0) - (spending[a] ?? 0));
  }, [spending, budgets, extra]);
  const addable = (Object.keys(CATEGORIES) as CategoryId[]).filter((c) => !shown.includes(c));

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
        <span className="grid size-9 place-items-center rounded-full bg-surface-3 text-ink-2">
          <Target className="size-4" />
        </span>
        Aylık bütçe hedefleri
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        {month ? `${formatYM(month)} harcamasına göre. ` : ""}Limitin %{WARN_RATIO * 100} değerine ulaşınca uyarı çıkar. Limitler yalnızca bu tarayıcıda saklanır.
      </p>
      <ul className="mt-4 space-y-3">
        {(showAll ? shown : shown.filter((c, i) => budgets[c] || extra.includes(c) || i < VISIBLE)).map((cat) => {
          const limit = budgets[cat];
          const spent = spending[cat] ?? 0;
          const level = limit ? budgetLevel(spent, limit) : "ok";
          return (
            <li key={cat}>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`budget-${cat}`} className="min-w-0 truncate text-sm font-medium text-ink">
                  {CATEGORIES[cat].label}
                </label>
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    id={`budget-${cat}`}
                    key={`${cat}-${limit ?? ""}`}
                    defaultValue={limit ? String(limit).replace(".", ",") : ""}
                    inputMode="decimal"
                    placeholder="Limit"
                    aria-label={`${CATEGORIES[cat].label} aylık limit (TL)`}
                    onBlur={(e) => setBudget(cat, parseLimit(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="tabular h-9 w-24 rounded-full border border-transparent bg-surface-2 px-2 text-right text-sm text-ink transition-colors placeholder:text-muted focus:border-brand/60 focus:bg-surface focus:outline-none"
                  />
                  <span className="text-xs text-muted">₺</span>
                </div>
              </div>
              {limit ? (
                <>
                  <div className="mt-1.5">
                    <BudgetBar spent={spent} limit={limit} level={level} />
                  </div>
                  <p className={cn("tabular mt-1 text-[11px]", LEVEL_TEXT[level])}>
                    {formatTL(spent)} / {formatTL(limit)} · {formatPct(spent / limit)}
                    {level === "over" ? " · limit aşıldı" : level === "warn" ? " · limite yaklaştı" : ""}
                  </p>
                </>
              ) : (
                <p className="tabular mt-0.5 text-[11px] text-muted">Bu ay {formatTL(spent)} · limit yok</p>
              )}
            </li>
          );
        })}
      </ul>
      {!showAll && shown.length > VISIBLE && shown.some((c, i) => i >= VISIBLE && !budgets[c] && !extra.includes(c)) && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-medium text-accent hover:bg-brand/10"
        >
          Tüm kategoriler ({shown.length})
        </button>
      )}
      {addable.length > 0 && (
        <label className="mt-4 flex items-center gap-2 text-xs text-muted">
          <Plus className="size-3.5" />
          <span className="sr-only">Bütçe eklenecek kategori</span>
          <select
            value=""
            onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value as CategoryId])}
            className="rounded-full border border-transparent bg-surface-2 px-3 py-1.5 text-xs text-ink"
          >
            <option value="">Başka kategori için limit ekle…</option>
            {addable.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].label}
              </option>
            ))}
          </select>
        </label>
      )}
    </Card>
  );
}
