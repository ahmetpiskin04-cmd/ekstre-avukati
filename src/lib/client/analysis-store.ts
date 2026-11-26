"use client";

import { useSyncExternalStore } from "react";
import { applyMerchantFixes } from "@/lib/statement/enrich";
import type { Scope } from "@/lib/statement/library";
import { analyzeStatement } from "./api";
import { mapStatements, saveAnalysis } from "./stores";

/**
 * Yapay zekâ analizinin durumu (görünüm anahtarıyla: tek ekstre veya birleşik).
 * React dışında tutuluyor: StrictMode çift effect'i ve sekme değişimi
 * aynı analizi iki kez başlatıp Gemini kotasını harcamasın.
 */
export type AnalysisStatus = { state: "idle" } | { state: "running" } | { state: "error"; message: string };

const status = new Map<string, AnalysisStatus>();
const listeners = new Set<() => void>();
const IDLE: AnalysisStatus = { state: "idle" };

function set(key: string, s: AnalysisStatus) {
  status.set(key, s);
  listeners.forEach((l) => l());
}

export function useAnalysisStatus(key: string | undefined): AnalysisStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (key ? (status.get(key) ?? IDLE) : IDLE),
    () => IDLE,
  );
}

/** Anahtar yeni girildi/değişti: önceki "anahtar yok/geçersiz" hataları silinir, analiz yeniden denenebilir. */
export function resetAnalysisErrors() {
  let changed = false;
  for (const [key, s] of status) {
    if (s.state === "error") {
      status.delete(key);
      changed = true;
    }
  }
  if (changed) listeners.forEach((l) => l());
}

/**
 * Analizi başlatır. Çalışıyorsa, hata aldıysa veya (force olmadan) analiz zaten
 * varsa bir şey yapmaz; hata sonrası otomatik döngüye girmez.
 */
export async function runAnalysis(scope: Scope, opts: { force?: boolean; hasAnalysis?: boolean } = {}) {
  const { key } = scope;
  const current = status.get(key);
  if (current?.state === "running") return;
  if (!opts.force && (opts.hasAnalysis || current?.state === "error")) return;
  if (!scope.transactions.some((t) => t.kind === "debit")) return;

  set(key, { state: "running" });
  try {
    const res = await analyzeStatement(scope.transactions);
    // İşyeri düzeltmeleri kapsamdaki tüm ekstrelere uygulanır (açıklama eşleşmesiyle).
    let changed = 0;
    mapStatements(
      scope.statements.map((s) => s.id ?? ""),
      (s) => {
        const r = applyMerchantFixes(s.transactions, res.merchantFixes);
        changed += r.changed;
        return { ...s, transactions: r.transactions };
      },
    );
    saveAnalysis(key, {
      model: res.model,
      createdAt: new Date().toISOString(),
      summary: res.summary,
      findings: res.findings,
      advice: res.advice,
      changedTransactions: changed,
      totalAnnualSaving: res.totalAnnualSaving,
    });
    set(key, IDLE);
  } catch (e) {
    set(key, { state: "error", message: e instanceof Error ? e.message : "Analiz başarısız." });
  }
}
