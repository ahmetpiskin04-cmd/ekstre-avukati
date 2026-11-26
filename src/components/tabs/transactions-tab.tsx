"use client";

import { Receipt, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDay, formatPct, formatTL } from "@/lib/format";
import { CATEGORIES } from "@/lib/statement/categories";
import type { CategoryTotal, StatementSummary } from "@/lib/statement/analyze";
import type { CategoryId, Transaction } from "@/lib/statement/types";
import { BudgetPanel } from "../budget-panel";
import { categoryColor, hasOwnSeries, SERIES_ORDER } from "../category-colors";
import { Card, CategoryBadge, cn, EmptyState, MerchantAvatar, Money, Pill, SectionTitle } from "../ui";

export function TransactionsTab({ transactions, summary }: { transactions: Transaction[]; summary: StatementSummary }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [showCredits, setShowCredits] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return transactions.filter((t) => {
      if (!showCredits && t.kind === "credit") return false;
      if (category && (t.kind === "credit" || t.category !== category)) return false;
      if (q && !`${t.merchant} ${t.description}`.toLocaleLowerCase("tr-TR").includes(q)) return false;
      return true;
    });
  }, [transactions, query, category, showCredits]);

  const filteredTotal = filtered.filter((t) => t.kind === "debit").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="min-w-0 overflow-hidden lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">İşlem ara</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İşyeri veya açıklama ara…"
              className="h-10 w-full rounded-full border border-transparent bg-surface-2 pl-9 pr-3 text-sm text-ink transition-colors placeholder:text-muted focus:border-brand/60 focus:bg-surface focus:outline-none"
            />
          </label>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-muted hover:text-ink">
            <input type="checkbox" checked={showCredits} onChange={(e) => setShowCredits(e.target.checked)} className="size-3.5 accent-[var(--brand)]" />
            Ödeme ve iadeler
          </label>
          {category && (
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
            >
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: categoryColor(category) }} />
              {CATEGORIES[category].label}
              <X className="size-3 text-muted" aria-label="Filtreyi kaldır" />
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<Receipt className="size-6" />} title="Eşleşen işlem yok">
            Aramayı veya kategori filtresini temizlemeyi deneyin.
          </EmptyState>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 z-10 bg-surface text-left text-xs font-semibold text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="hidden w-24 px-4 py-2.5 font-medium sm:table-cell">Tarih</th>
                  <th scope="col" className="py-2.5 pl-4 pr-2 font-medium sm:pl-2">İşyeri</th>
                  <th scope="col" className="hidden w-44 px-4 py-2.5 font-medium sm:table-cell">Kategori</th>
                  <th scope="col" className="w-28 px-4 py-2.5 text-right font-medium sm:w-36">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    className="group border-b border-line/60 transition-colors duration-100 last:border-0 hover:bg-surface-2/80 [&>td:first-child]:shadow-[inset_2px_0_0_transparent] hover:[&>td:first-child]:shadow-[inset_2px_0_0_var(--brand)]"
                  >
                    <td className="tabular hidden whitespace-nowrap px-4 py-2.5 text-xs text-muted sm:table-cell">{formatDay(t.date)}</td>
                    <td className="py-2.5 pl-4 pr-2 sm:pl-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <MerchantAvatar name={t.merchant} category={t.category} credit={t.kind === "credit"} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 font-medium text-ink">
                            <span className="truncate">{t.merchant}</span>
                            {t.aiEnriched && (
                              <Sparkles className="size-3 shrink-0 text-accent" aria-label="Yapay zekâ ile düzeltildi">
                                <title>Yapay zekâ ile düzeltildi</title>
                              </Sparkles>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted" title={t.description}>
                            <span className="tabular sm:hidden">{formatDay(t.date)} · </span>
                            {t.description}
                          </p>
                          <div className="mt-1 sm:hidden">
                            {t.kind === "credit" ? <Pill tone="good">Ödeme / iade</Pill> : <CategoryBadge category={t.category} />}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">
                      {t.kind === "credit" ? <Pill tone="good">Ödeme / iade</Pill> : <CategoryBadge category={t.category} />}
                    </td>
                    <td className={cn("px-4 py-2.5 text-right font-semibold", t.kind === "credit" ? "text-good" : "text-ink")}>
                      <Money value={t.amount} sign={t.kind === "credit" ? "+" : undefined} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line bg-surface-2/40 px-4 py-2.5 text-xs text-muted">
          <span className="tabular">{filtered.length} işlem</span>
          <span className="flex items-center gap-1.5">
            Harcama toplamı <Money value={filteredTotal} className="text-sm font-semibold text-ink" />
          </span>
        </div>
      </Card>

      <div className="min-w-0 space-y-4">
        <CategoryBreakdown summary={summary} active={category} onSelect={setCategory} />
        <BudgetPanel transactions={transactions} />
      </div>
    </div>
  );
}

type Segment = { key: CategoryId | "other"; label: string; total: number; share: number; members: CategoryTotal[] };

/**
 * Harcama dağılımı: yığılmış yatay çubuk (bütün = toplam harcama) + değerleri yazılı lejant.
 * Dataviz kuralları: en fazla 8 renk (7 kategori + "Diğer"), renk kategoriye sabit,
 * segmentler doğrulanmış komşuluk sırasında, aralarında 2px zemin boşluğu, üzerine gelince ipucu.
 */
function CategoryBreakdown({ summary, active, onSelect }: { summary: StatementSummary; active: CategoryId | null; onSelect: (c: CategoryId | null) => void }) {
  const [hover, setHover] = useState<Segment["key"] | null>(null);
  const total = summary.totalSpending || 1;

  const segments = useMemo<Segment[]>(() => {
    const byCat = new Map(summary.categories.map((c) => [c.category, c]));
    const own: Segment[] = SERIES_ORDER.filter((c) => byCat.has(c)).map((c) => {
      const t = byCat.get(c)!;
      return { key: c, label: CATEGORIES[c].label, total: t.total, share: t.share, members: [t] };
    });
    const rest = summary.categories.filter((c) => !hasOwnSeries(c.category));
    if (rest.length) {
      const sum = rest.reduce((s, c) => s + c.total, 0);
      own.push({ key: "other", label: "Diğer kategoriler", total: sum, share: sum / total, members: rest });
    }
    return own;
  }, [summary, total]);

  // Her segmentin başlangıcı = öncekilerin payları toplamı (ipucunu ortasına konumlamak için).
  const placed = segments.map((s, i) => {
    const start = segments.slice(0, i).reduce((sum, x) => sum + x.share * 100, 0);
    return { ...s, start, mid: start + (s.share * 100) / 2 };
  });
  const hovered = placed.find((s) => s.key === hover);

  return (
    <Card className="p-5">
      <SectionTitle title="Harcama dağılımı" sub="Bir kategoriye tıklayarak listeyi süzün." />

      <div className="relative mt-5">
        {hovered && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-ink px-3 py-2 text-xs text-bg shadow-lift"
            style={{ left: `${Math.min(88, Math.max(12, hovered.mid))}%` }}
          >
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <span aria-hidden className="size-2 rounded-full" style={{ background: hovered.key === "other" ? "var(--cat-other)" : categoryColor(hovered.key) }} />
              {hovered.label}
            </p>
            <p className="tabular mt-0.5 text-muted">
              {formatTL(hovered.total)} · {formatPct(hovered.share)}
            </p>
          </div>
        )}
        <div className="animate-grow-x flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Kategorilere göre harcama dağılımı; değerler aşağıdaki listede">
          {placed.map((s) => {
            const color = s.key === "other" ? "var(--cat-other)" : categoryColor(s.key);
            const dim = (active && s.key !== active) || (hover && s.key !== hover);
            return (
              <button
                key={s.key}
                type="button"
                tabIndex={-1}
                aria-hidden
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                onClick={() => s.key !== "other" && onSelect(active === s.key ? null : s.key)}
                className={cn("no-press h-full min-w-[3px] origin-bottom transition-[opacity,transform] duration-200 first:rounded-l-full last:rounded-r-full hover:scale-y-[1.35]", s.key !== "other" && "cursor-pointer", dim && "opacity-35")}
                style={{ width: `${s.share * 100}%`, background: color }}
              />
            );
          })}
        </div>
      </div>

      <ul className="mt-4 space-y-0.5">
        {summary.categories.map((c) => {
          const selected = active === c.category;
          const color = hasOwnSeries(c.category) ? categoryColor(c.category) : "var(--cat-other)";
          const seg: Segment["key"] = hasOwnSeries(c.category) ? c.category : "other";
          return (
            <li key={c.category}>
              <button
                type="button"
                onClick={() => onSelect(selected ? null : c.category)}
                onMouseEnter={() => setHover(seg)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(seg)}
                onBlur={() => setHover(null)}
                aria-pressed={selected}
                title={`${CATEGORIES[c.category].label}: ${formatTL(c.total)} · ${c.count} işlem`}
                className={cn(
                  "nudge flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 text-left text-sm",
                  selected ? "bg-brand/10" : "hover:bg-surface-2",
                  active && !selected && "opacity-50",
                )}
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
                <span className="min-w-0 flex-1 truncate text-ink">{CATEGORIES[c.category].label}</span>
                <Money value={c.total} decimals={false} className="text-xs font-medium text-ink" />
                <span className="tabular w-10 text-right text-xs text-muted">{formatPct(c.share)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
