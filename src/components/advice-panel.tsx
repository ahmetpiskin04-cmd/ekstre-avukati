"use client";

import { Ban, ChevronDown, Gavel, Handshake, Lightbulb, LoaderCircle, Repeat, Scale, Sparkles, TrendingUp, TriangleExclamationPoint } from "lucide-react";
import { useState, type ReactNode } from "react";
import { runAnalysis, useAnalysisStatus } from "@/lib/client/analysis-store";
import { useAnalyses } from "@/lib/client/stores";
import type { Scope } from "@/lib/statement/library";
import { adviceTotal } from "@/lib/statement/savings";
import { formatTL, formatTLShort } from "@/lib/format";
import type { AdviceKind, AiAdvice, AiFinding, FindingType } from "@/lib/statement/types";
import { Card, cn, Pill } from "./ui";

const KIND: Record<AdviceKind, { label: string; icon: ReactNode }> = {
  itiraz: { label: "İtiraz et", icon: <Gavel className="size-3" /> },
  iptal: { label: "İptal et", icon: <Ban className="size-3" /> },
  pazarlik: { label: "Pazarlık yap", icon: <Handshake className="size-3" /> },
  aliskanlik: { label: "Alışkanlık", icon: <Lightbulb className="size-3" /> },
};

const PRIORITY = { yuksek: { label: "Öncelikli", tone: "bad" }, orta: { label: "Orta", tone: "warn" }, dusuk: { label: "Düşük", tone: "neutral" } } as const;

const FINDING_ICON: Record<FindingType, ReactNode> = {
  "gizli-abonelik": <Repeat className="size-3.5" />,
  "banka-masrafi": <Scale className="size-3.5" />,
  faiz: <Scale className="size-3.5" />,
  "harcama-artisi": <TrendingUp className="size-3.5" />,
  "cakisan-abonelik": <Repeat className="size-3.5" />,
  "fiyat-artisi": <TrendingUp className="size-3.5" />,
  diger: <Lightbulb className="size-3.5" />,
};

export function AdvicePanel({ scope }: { scope: Scope }) {
  const status = useAnalysisStatus(scope.key);
  const analysis = useAnalyses()[scope.key];

  if (status.state === "running" && !analysis) {
    return (
      <Card className="flex items-center gap-3 border-brand/30 p-5">
        <LoaderCircle className="size-5 animate-spin text-accent" />
        <div>
          <p className="font-semibold text-ink">Ekstre Avukatı dosyanızı inceliyor…</p>
          <p className="text-xs text-muted">Gemini işyeri adlarını temizliyor, gizli masrafları arıyor ve tavsiyeleri yazıyor (genellikle 20-60 sn).</p>
        </div>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
            <Sparkles className="size-4" />
          </span>
          <div>
            <p className="font-semibold text-ink">Ekstre Avukatı Tavsiyesi</p>
            <p className="text-xs text-muted">
              {status.state === "error"
                ? `Analiz yapılamadı: ${status.message}`
                : scope.combined
                  ? "Birleşik görünüm için ayrı bir analiz yapılabilir (tüm ekstreler birlikte değerlendirilir)."
                  : "Yapay zekâ analizi henüz yapılmadı."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runAnalysis(scope, { force: true })}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg shadow-card transition hover:brightness-110"
        >
          <Sparkles className="size-4" />
          {status.state === "error" ? "Tekrar dene" : scope.combined ? "Birleşik analiz et" : "Analiz et"}
        </button>
      </Card>
    );
  }

  // Kod tarafında tekilleştirilmiş toplam: aynı kesinti iki maddede sayılmaz.
  const totalSaving = adviceTotal(analysis);

  return (
    <Card className="overflow-hidden border-brand/30">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-accent-soft/50 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink">
            <Scale className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold text-ink">Ekstre Avukatı Tavsiyesi & İtiraz/İptal Rehberi</h3>
            <p className="mt-1 max-w-3xl text-sm text-ink-2">{analysis.summary}</p>
          </div>
        </div>
        {totalSaving > 0 && (
          <div className="rounded-xl bg-surface px-4 py-2 text-right shadow-card">
            <p className="text-[11px] text-muted">Tavsiyelerle yıllık</p>
            <p className="tabular text-lg font-semibold text-accent">≈ {formatTLShort(totalSaving)}</p>
          </div>
        )}
      </div>

      <ol className="divide-y divide-line">
        {analysis.advice.map((a, i) => (
          <AdviceItem key={i} index={i + 1} a={a} />
        ))}
      </ol>

      {analysis.findings.length > 0 && (
        <div className="border-t border-line bg-surface-2/40 p-5">
          <h4 className="text-[13px] font-bold text-ink-2">Tespitler</h4>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {analysis.findings.map((f, i) => (
              <FindingItem key={i} f={f} />
            ))}
          </ul>
        </div>
      )}

      <p className="flex items-center gap-1.5 border-t border-line px-5 py-2.5 text-[11px] text-muted">
        <TriangleExclamationPoint className="size-3" />
        Yapay zekâ ({analysis.model}) önerisidir, hukuki danışmanlık yerine geçmez. Tutarlar ekstredeki rakamlardan hesaplanmıştır.
      </p>
    </Card>
  );
}

/** Tıklayınca açılıp kapanan tavsiye maddesi (ilki açık gelir). */
function AdviceItem({ index, a }: { index: number; a: AiAdvice }) {
  const kind = KIND[a.kind];
  const prio = PRIORITY[a.priority];
  const [open, setOpen] = useState(index === 1);
  const bodyId = `advice-body-${index}`;
  return (
    <li className={cn("transition-colors duration-300", open ? "bg-surface-2/60" : "hover:bg-surface-2/40")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="no-press flex w-full cursor-pointer items-start gap-4 px-5 pb-2 pt-5 text-left"
      >
        <span
          className={cn(
            "tabular grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-all duration-500 [transition-timing-function:var(--ease-spring)]",
            open ? "rotate-[360deg] bg-ink text-bg" : "bg-accent-soft text-accent",
          )}
        >
          {index}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-1">
          <span className="font-bold text-ink">{a.title}</span>
          <Pill tone="accent" icon={kind.icon}>
            {kind.label}
          </Pill>
          <Pill tone={prio.tone}>{prio.label}</Pill>
        </span>
        <ChevronDown className={cn("mt-1.5 size-4 shrink-0 text-muted transition-transform duration-300", open && "rotate-180")} aria-hidden />
      </button>
      <div className="flex gap-4 px-5 pb-5">
        <span aria-hidden className="w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <div id={bodyId} className="expand" data-open={open}>
            <div>
              <p className="pt-1 text-sm leading-relaxed text-ink-2">{a.action}</p>
              {a.legalNote && (
                <p className="mt-2.5 flex items-start gap-1.5 rounded-2xl bg-surface px-3.5 py-2.5 text-xs text-ink-2 shadow-card">
                  <Gavel className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  {a.legalNote}
                </p>
              )}
            </div>
          </div>
          {!open && <p className="line-clamp-1 text-sm text-muted">{a.action}</p>}
        </div>
        {a.annualSaving !== null && a.annualSaving > 0 && (
          <div className="hidden shrink-0 text-right sm:block">
            <p className="tabular text-lg font-bold text-good">{formatTLShort(a.annualSaving)}</p>
            <p className="text-[11px] text-muted">yıllık tasarruf</p>
          </div>
        )}
      </div>
    </li>
  );
}

function FindingItem({ f }: { f: AiFinding }) {
  return (
    <li className="nudge flex gap-2.5 rounded-2xl bg-surface-2 p-4">
      <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg", f.type === "harcama-artisi" || f.type === "fiyat-artisi" ? "bg-warn-fill/12 text-warn" : "bg-bad-fill/10 text-bad")}>
        {FINDING_ICON[f.type]}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {f.title}
          {f.amount !== null && <span className="tabular ml-1.5 text-xs font-semibold text-muted">{formatTL(f.amount)}</span>}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{f.detail}</p>
      </div>
    </li>
  );
}
