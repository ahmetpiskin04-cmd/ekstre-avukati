import { ArrowDownRight, ArrowUpRight, Minus, Repeat, TrendingUp } from "lucide-react";
import { formatSignedPct, formatTL, formatTLShort, formatYM } from "@/lib/format";
import { CATEGORIES } from "@/lib/statement/categories";
import type { MonthComparison } from "@/lib/statement/trend";
import { Card, cn } from "./ui";

/** "Önceki Aya Göre Değişim": tüm rakamlar kodla hesaplanır, yapay zekâ içermez. */
export function TrendPanel({ comparison: c }: { comparison: MonthComparison }) {
  const up = c.change > 0;
  const flat = c.change === 0;
  const Arrow = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? "text-ink-2" : up ? "text-bad" : "text-good";

  return (
    <Card className="p-5">
      <section aria-label="Önceki aya göre değişim">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
              <TrendingUp className="size-4" />
            </span>
            <div>
              <h3 className="font-semibold text-ink">Önceki Aya Göre Değişim</h3>
              <p className="text-xs text-muted">
                {formatYM(c.previousMonth)} → {formatYM(c.currentMonth)} · tüm yüklü ekstrelere göre
                {c.gap && " · aradaki ay için ekstre yok"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={cn("tabular flex items-center justify-end gap-1 text-2xl font-semibold", tone)}>
              <Arrow className="size-5" />
              {c.changePct === null ? "—" : formatSignedPct(c.changePct)}
            </p>
            <p className="tabular text-xs text-muted">
              {formatTL(c.previousTotal)} → {formatTL(c.currentTotal)} ({c.change >= 0 ? "+" : "-"}
              {formatTLShort(Math.abs(c.change))})
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-[13px] font-bold text-ink-2">En çok artan kategoriler</h4>
            {c.topIncreases.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">Hiçbir kategoride artış yok.</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {c.topIncreases.map((i, idx) => (
                  <li key={i.category} className="nudge flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="tabular grid size-5 shrink-0 place-items-center rounded-full bg-bad-fill/10 text-[11px] font-semibold text-bad">{idx + 1}</span>
                      <span className="truncate font-medium text-ink">{CATEGORIES[i.category].label}</span>
                    </span>
                    <span className="tabular shrink-0 text-right text-xs">
                      <strong className="text-bad">+{formatTLShort(i.change)}</strong>
                      <span className="text-muted"> · {i.changePct === null ? "yeni" : formatSignedPct(i.changePct)}</span>
                      <span className="block text-[11px] text-muted">
                        {formatTLShort(i.previous)} → {formatTLShort(i.current)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <h4 className="text-[13px] font-bold text-ink-2">Yeni eklenen abonelikler</h4>
            {c.newSubscriptions.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">{formatYM(c.currentMonth)} ayında yeni abonelik görünmüyor.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {c.newSubscriptions.map((s) => (
                  <li key={s.merchant} className="nudge flex items-center justify-between gap-3 rounded-2xl bg-warn-fill/10 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Repeat className="size-4 shrink-0 text-warn" />
                      <span className="truncate font-medium text-ink">{s.merchant}</span>
                    </span>
                    <span className="tabular shrink-0 text-xs text-ink-2">
                      {formatTL(s.monthlyAmount)}/ay · yıllık {formatTLShort(s.annualCost)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">Ay bazlı toplamlar işlem tarihine göredir; ekstre kesim tarihi ay ortasındaysa bir ay kısmi görünebilir.</p>
      </section>
    </Card>
  );
}
