"use client";

import { MessagesSquare, Receipt, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { runAnalysis } from "@/lib/client/analysis-store";
import { migrateLegacyStorage, useActiveId, useAnalyses, useBudgets, useLibrary } from "@/lib/client/stores";
import { summarize } from "@/lib/statement/analyze";
import { budgetStatuses, latestMonth } from "@/lib/statement/budget";
import { kpiTrends } from "@/lib/statement/kpi";
import { mergeTransactions, resolveScope, statementLabel } from "@/lib/statement/library";
import type { ReportData } from "@/lib/statement/report";
import { compareLatestMonths } from "@/lib/statement/trend";
import type { MaskReport } from "@/lib/statement/types";
import { AppHeader } from "./app-header";
import { UpdateBanner } from "./app-update";
import { GeminiKeyBanner, useHasGeminiKey } from "./gemini-key";
import { BudgetAlerts } from "./budget-panel";
import { ExportBar } from "./export-bar";
import { PrintReport } from "./print-report";
import { SummaryCards } from "./summary-cards";
import { ChatTab } from "./tabs/chat-tab";
import { SubscriptionsTab } from "./tabs/subscriptions-tab";
import { TransactionsTab } from "./tabs/transactions-tab";
import { TrendPanel } from "./trend-panel";
import { Card, cn, EmptyState } from "./ui";
import { UploadPanel } from "./upload-panel";

type TabId = "harcamalar" | "abonelikler" | "sohbet";

export function Dashboard() {
  const library = useLibrary();
  const activeId = useActiveId();
  const analyses = useAnalyses();
  const budgets = useBudgets();
  const hasKey = useHasGeminiKey();
  const [tab, setTab] = useState<TabId>("harcamalar");

  // Önceki sürümün tek ekstre kaydını kütüphaneye taşı (bir kez).
  useEffect(() => migrateLegacyStorage(), []);

  const scope = useMemo(() => resolveScope(library, activeId), [library, activeId]);
  const summary = useMemo(() => (scope ? summarize(scope.transactions) : null), [scope]);
  const analysis = scope ? (analyses[scope.key] ?? null) : null;

  // Aylar arası değişim, seçili görünümden bağımsız olarak TÜM yüklü ekstrelerden hesaplanır.
  const allTransactions = useMemo(() => (library.length > 1 ? mergeTransactions(library) : (library[0]?.transactions ?? [])), [library]);
  const comparison = useMemo(() => compareLatestMonths(allTransactions), [allTransactions]);
  const trends = useMemo(() => kpiTrends(allTransactions), [allTransactions]);

  const maskReport = useMemo<MaskReport | null>(
    () =>
      scope
        ? scope.statements.reduce(
            (a, s) => ({ cards: a.cards + s.maskReport.cards, ibans: a.ibans + s.maskReport.ibans, nationalIds: a.nationalIds + s.maskReport.nationalIds }),
            { cards: 0, ibans: 0, nationalIds: 0 },
          )
        : null,
    [scope],
  );

  // Tek ekstrenin analizi otomatik başlar; birleşik görünümün analizi isteğe bağlı (kota için).
  // runAnalysis çift çalışmayı ve hata sonrası döngüyü kendi içinde engeller.
  useEffect(() => {
    // Telefonda anahtar girilene kadar otomatik analiz başlamaz (hata göstermek yerine bekler).
    if (scope && !scope.combined && hasKey) void runAnalysis(scope, { hasAnalysis: Boolean(analysis) });
  }, [scope, analysis, hasKey]);

  const reportData = useMemo<ReportData | null>(() => {
    if (!scope || !summary) return null;
    const month = latestMonth(scope.transactions);
    return {
      generatedAt: new Date().toISOString().slice(0, 10),
      scopeLabel: scope.combined ? `Tüm ekstreler (${scope.statements.length})` : statementLabel(scope.statements[0]),
      summary,
      comparison,
      budgetMonth: month,
      budgets: budgetStatuses(scope.transactions, budgets, month),
      analysis,
      transactions: scope.transactions,
    };
  }, [scope, summary, comparison, budgets, analysis]);

  const tabs: Array<{ id: TabId; label: string; short: string; icon: ReactNode; count?: number }> = [
    { id: "harcamalar", label: "Harcama Kalemleri & Kategoriler", short: "Harcamalar", icon: <Receipt className="size-4" />, count: scope?.transactions.length },
    {
      id: "abonelikler",
      label: "Abonelik & Kesinti Avcısı",
      short: "Avcı",
      icon: <ShieldCheck className="size-4" />,
      count: summary ? summary.subscriptions.length + summary.fees.length : undefined,
    },
    { id: "sohbet", label: "Ekstremle Sohbet Et", short: "Sohbet", icon: <MessagesSquare className="size-4" /> },
  ];

  return (
    <>
      <AppHeader library={library} scope={scope} maskReport={maskReport} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:p-0">
        <div className="stagger space-y-6 print:hidden">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[28px] font-extrabold tracking-[-0.025em] text-ink sm:text-4xl">Ekstrenizdeki kaçakları bulalım</h1>
              <p className="mt-1.5 max-w-2xl text-[15px] text-ink-2">Gizli abonelikler, zamlanan servisler ve gereksiz banka kesintileri tek ekranda.</p>
            </div>
            {reportData && <ExportBar data={reportData} />}
          </div>

          <UpdateBanner />
          <GeminiKeyBanner />
          <SummaryCards summary={summary} trends={summary ? trends : null} />
          <UploadPanel scope={scope} count={library.length} />
          {comparison && <TrendPanel comparison={comparison} />}
          {scope && <BudgetAlerts transactions={scope.transactions} />}

          <section aria-label="Analiz" className="space-y-4 pt-1">
            <Tabs tabs={tabs} active={tab} onChange={setTab} />

            <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} key={tab} className="animate-fade-up">
              {!scope || !summary ? (
                <Card>
                  <EmptyState icon={<Sparkles className="size-6" />} title="Analiz için bir ekstre yükleyin">
                    Yukarıdan PDF/CSV ekstrenizi yükleyin ya da <strong>Örnek Ekstre ile Dene</strong> düğmesiyle uygulamayı tek tıkla deneyin.
                  </EmptyState>
                </Card>
              ) : tab === "harcamalar" ? (
                <TransactionsTab transactions={scope.transactions} summary={summary} />
              ) : tab === "abonelikler" ? (
                <SubscriptionsTab summary={summary} scope={scope} />
              ) : (
                <ChatTab key={scope.key} summary={summary} scopeKey={scope.key} transactions={scope.transactions} combined={scope.combined} />
              )}
            </div>
          </section>
        </div>
        {reportData && <PrintReport data={reportData} />}
      </main>
    </>
  );
}

/** Kayan hap göstergeli sekmeler (gösterge DOM ölçüsüyle konumlanır; setState yok). */
function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; short: string; icon: ReactNode; count?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const place = () => {
      const el = list.querySelector<HTMLElement>(`[data-tab="${active}"]`);
      if (!el) return;
      indicator.style.transform = `translateX(${el.offsetLeft}px)`;
      indicator.style.width = `${el.offsetWidth}px`;
      indicator.style.opacity = "1";
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(list);
    return () => ro.disconnect();
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
  }

  return (
    <div className="no-scrollbar overflow-x-auto">
      <div ref={listRef} role="tablist" aria-label="Analiz sekmeleri" onKeyDown={onKeyDown} className="relative inline-flex w-max gap-1 rounded-full bg-surface-3/80 p-1.5">
        <span
          ref={indicatorRef}
          aria-hidden
          className="pointer-events-none absolute inset-y-1.5 left-0 rounded-full bg-surface opacity-0 shadow-card transition-[transform,width] duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)]"
        />
        {tabs.map((t) => {
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              data-tab={t.id}
              role="tab"
              type="button"
              tabIndex={selected ? 0 : -1}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              aria-label={t.count !== undefined ? `${t.label} (${t.count})` : t.label}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative z-10 inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors duration-200",
                selected ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              <span className={cn("transition-colors", selected ? "text-accent" : "")}>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short}</span>
              {t.count !== undefined && (
                <span className={cn("tabular rounded-full px-2 py-0.5 text-[11px] font-bold", selected ? "bg-accent-soft text-accent" : "bg-surface text-muted")}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
