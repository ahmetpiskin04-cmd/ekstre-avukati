"use client";

import { ChartPie, PiggyBank, Repeat, Wallet } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { formatPct, formatPeriod, formatTLShort, formatYM } from "@/lib/format";
import { CATEGORIES } from "@/lib/statement/categories";
import type { StatementSummary } from "@/lib/statement/analyze";
import type { KpiTrends } from "@/lib/statement/kpi";
import { categoryColor } from "./category-colors";
import { CountUpMoney, CountUpNumber, tiltHandlers } from "./motion";
import { CategoryDot, cn, TrendChip } from "./ui";

/** Fareyi izleyen eğim: kutucuklarda biraz daha belirgin, büyük kartta daha sakin. */
const TILE_TILT = tiltHandlers(6);
const HERO_TILT = tiltHandlers(4);

/** Yan KPI kutucuğu: yumuşak yüzey, renkli yuvarlak ikon. */
function Tile({
  icon,
  iconColor,
  label,
  value,
  trend,
  sub,
  mock,
  index,
}: {
  icon: ReactNode;
  iconColor: string;
  label: string;
  value: ReactNode;
  trend?: ReactNode;
  sub: ReactNode;
  mock?: boolean;
  index: number;
}) {
  return (
    <div
      {...TILE_TILT}
      style={{ "--i": index } as CSSProperties}
      className={cn("tilt group/tile relative flex flex-col rounded-[28px] bg-surface p-5 shadow-card", mock && "opacity-60")}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink-2">{label}</span>
        <span
          className="grid size-10 place-items-center rounded-full transition-transform duration-500 [transition-timing-function:var(--ease-spring)] group-hover/tile:rotate-12"
          style={{ color: iconColor, background: `color-mix(in oklab, ${iconColor} 14%, transparent)` }}
        >
          {icon}
        </span>
      </div>
      <div className="mt-4 truncate text-[26px] font-bold leading-none tracking-tight text-ink">{value}</div>
      <div className="mt-auto flex min-h-5 flex-wrap items-center gap-2 pt-3 text-xs text-muted">
        {trend}
        <span className="min-w-0 truncate">{sub}</span>
      </div>
    </div>
  );
}

export function SummaryCards({ summary, trends }: { summary: StatementSummary | null; trends: KpiTrends | null }) {
  const mock = !summary;
  const top = summary?.categories[0];
  const vs = trends ? `${formatYM(trends.previousMonth)} → ${formatYM(trends.currentMonth)}` : undefined;

  return (
    <section aria-label="Özet">
      {mock && (
        <p className="mb-3 flex items-center gap-2 text-xs font-medium text-ink-2">
          <span className="inline-block size-2 rounded-full bg-warn-fill" />
          Örnek görünüm — ekstrenizi yüklediğinizde gerçek değerlerle dolar.
        </p>
      )}
      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1.55fr_1fr_1fr_1fr]">
        {/* Ana kart: toplam harcama */}
        <div
          {...HERO_TILT}
          style={{ "--i": 0 } as CSSProperties}
          className={cn("hero-card tilt relative overflow-hidden rounded-[32px] p-6 shadow-card sm:col-span-2 xl:col-span-1", mock && "opacity-70")}
        >
          {/* Yavaşça süzülen yumuşak ışık lekeleri */}
          <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 animate-[float_9s_ease-in-out_infinite] rounded-full bg-white/40 blur-3xl dark:bg-white/5" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 left-10 size-48 animate-[float_11s_ease-in-out_infinite_reverse] rounded-full bg-emerald-300/30 blur-3xl dark:bg-emerald-400/10" />
          <div className="relative flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-2">
              <span className="grid size-10 place-items-center rounded-full bg-surface/80 text-ink shadow-card">
                <Wallet className="size-[18px]" />
              </span>
              Toplam harcama
            </span>
            {trends && <TrendChip pct={trends.total} title={`Son ayın harcaması, önceki aya göre (${vs})`} label={`${formatYM(trends.currentMonth)}`} />}
          </div>
          <div className="relative mt-6 text-[44px] font-extrabold leading-none tracking-[-0.03em] text-ink sm:text-5xl">
            <CountUpMoney value={summary?.totalSpending ?? 24580.4} />
          </div>
          <div className="relative mt-5 flex flex-wrap gap-2">
            {[
              summary ? formatPeriod(summary.periodStart, summary.periodEnd) : "3 ay",
              summary?.monthsCovered && summary.monthsCovered > 1 ? `Ort. ${formatTLShort(summary.monthlyAverage)}/ay` : mock ? "Ort. ₺8.193/ay" : null,
              summary ? `${summary.transactionCount} işlem` : "80 işlem",
            ]
              .filter(Boolean)
              .map((t) => (
                <span key={t} className="tabular rounded-full bg-surface/70 px-3 py-1.5 text-xs font-semibold text-ink-2 backdrop-blur">
                  {t}
                </span>
              ))}
          </div>
        </div>

        <Tile
          index={1}
          mock={mock}
          icon={<Repeat className="size-[18px]" />}
          iconColor="var(--cat-7)"
          label="Abonelikler"
          value={
            <>
              <CountUpNumber value={summary?.subscriptions.length ?? 6} />
              <span className="ml-1.5 text-base font-semibold text-muted">adet</span>
            </>
          }
          trend={trends && <TrendChip pct={trends.subscriptions} title={`Abonelik kategorisindeki harcama, önceki aya göre (${vs})`} />}
          sub={
            summary
              ? summary.subscriptions.length
                ? `${formatTLShort(summary.monthlySubscriptionCost)}/ay`
                : "Tekrarlayan ödeme yok"
              : "₺1.249/ay"
          }
        />
        <Tile
          index={2}
          mock={mock}
          icon={<ChartPie className="size-[18px]" />}
          iconColor={top ? categoryColor(top.category) : "var(--cat-1)"}
          label="En çok harcanan"
          value={
            <span className="inline-flex items-center gap-2">
              {top && <CategoryDot category={top.category} className="size-2.5" />}
              {top ? CATEGORIES[top.category].label : mock ? "Market" : "—"}
            </span>
          }
          trend={trends && top && <TrendChip pct={trends.category(top.category)} title={`${CATEGORIES[top.category].label}: son ay, önceki aya göre (${vs})`} />}
          sub={top ? `${formatPct(top.share)} · ${formatTLShort(top.total)}` : mock ? "%32 · ₺7.865" : "Harcama yok"}
        />
        <Tile
          index={3}
          mock={mock}
          icon={<PiggyBank className="size-[18px]" />}
          iconColor="var(--accent)"
          label="Tasarruf potansiyeli"
          value={
            <span className="text-accent">
              <CountUpMoney value={summary?.savings.total ?? 3870} decimals={false} />
              <span className="ml-1 text-base font-semibold opacity-70">/yıl</span>
            </span>
          }
          trend={trends && <TrendChip pct={trends.fees} title={`Banka kesintileri, son ay önceki aya göre (${vs})`} label="kesinti" />}
          sub={
            summary
              ? summary.savings.total > 0
                ? `${formatTLShort(summary.savings.fees)} kesinti + ${formatTLShort(summary.savings.overlaps)} çakışma`
                : "Kaçak bulunamadı"
              : "₺1.420 kesinti + ₺2.450 çakışma"
          }
        />
      </div>
    </section>
  );
}
