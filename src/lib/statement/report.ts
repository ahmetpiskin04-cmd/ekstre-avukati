import { SERVICE_GROUP_LABEL, type StatementSummary } from "./analyze";
import type { BudgetStatus } from "./budget";
import { CATEGORIES } from "./categories";
import { adviceTotal } from "./savings";
import type { MonthComparison } from "./trend";
import type { AiAnalysis, Transaction } from "./types";

/** Dışa aktarma (CSV ve yazdırılabilir rapor) için tek veri modeli. */
export interface ReportData {
  /** YYYY-AA-GG */
  generatedAt: string;
  scopeLabel: string;
  summary: StatementSummary;
  comparison: MonthComparison | null;
  budgetMonth: string | null;
  budgets: BudgetStatus[];
  analysis: AiAnalysis | null;
  transactions: Transaction[];
}

const SEP = ";";

/** Excel formül enjeksiyonunu önler: = + - @ ile başlayan METİN hücrelerinin başına ' koyar. */
export function textCell(value: string): string {
  const v = value.replace(/[\r\n]+/g, " ").trim();
  const safe = /^[=+\-@\t]/.test(v) ? `'${v}` : v;
  return /[";]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Türkçe Excel için ondalık virgül; binlik ayracı yok (hücre sayı olarak okunsun). */
export const numCell = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? "" : n.toFixed(digits).replace(".", ","));

function line(cells: Array<{ t: string } | { n: number | null | undefined; d?: number }>): string {
  return cells.map((c) => ("t" in c ? textCell(c.t) : numCell(c.n, c.d))).join(SEP);
}
const T = (t: string | null | undefined) => ({ t: t ?? "" });
const N = (n: number | null | undefined, d?: number) => ({ n, d });

export function buildCsv(data: ReportData): string {
  const { summary: s, comparison: c, analysis } = data;
  const out: string[] = [];
  const section = (title: string) => {
    out.push("", textCell(title));
  };

  out.push(line([T("Ekstre Avukatı Raporu")]));
  out.push(line([T("Oluşturulma"), T(data.generatedAt)]));
  out.push(line([T("Kapsam"), T(data.scopeLabel)]));
  out.push(line([T("Dönem"), T(`${s.periodStart ?? ""} – ${s.periodEnd ?? ""}`)]));

  section("ÖZET");
  out.push(line([T("Toplam harcama (TL)"), N(s.totalSpending)]));
  out.push(line([T("Aylık ortalama (TL)"), N(s.monthlyAverage)]));
  out.push(line([T("Toplam ödeme/iade (TL)"), N(s.totalCredits)]));
  out.push(line([T("İşlem sayısı"), N(s.transactionCount, 0)]));
  out.push(line([T("Aylık abonelik yükü (TL)"), N(s.monthlySubscriptionCost)]));
  out.push(line([T("Banka kesintisi, dönem (TL)"), N(s.feeTotal)]));
  out.push(line([T("Tasarruf potansiyeli, yıllık (TL)"), N(s.savings.total)]));
  if (analysis) out.push(line([T("Tavsiyelerle tekilleştirilmiş tasarruf, yıllık (TL)"), N(adviceTotal(analysis))]));

  if (c) {
    section("ÖNCEKİ AYA GÖRE DEĞİŞİM");
    out.push(line([T("Önceki ay"), T(c.previousMonth), T("Son ay"), T(c.currentMonth)]));
    out.push(line([T("Önceki ay harcaması (TL)"), N(c.previousTotal)]));
    out.push(line([T("Son ay harcaması (TL)"), N(c.currentTotal)]));
    out.push(line([T("Değişim (TL)"), N(c.change)]));
    out.push(line([T("Değişim (%)"), N(c.changePct, 1)]));
    out.push(line([T("En çok artan kategori"), T("Önceki (TL)"), T("Son (TL)"), T("Artış (TL)"), T("Artış (%)")]));
    for (const i of c.topIncreases) out.push(line([T(CATEGORIES[i.category].label), N(i.previous), N(i.current), N(i.change), N(i.changePct, 1)]));
    for (const sub of c.newSubscriptions) out.push(line([T("Yeni abonelik"), T(sub.merchant), N(sub.monthlyAmount), T(sub.firstDate)]));
  }

  section("KATEGORİLER");
  const budgetByCat = new Map(data.budgets.map((b) => [b.category, b]));
  out.push(line([T("Kategori"), T("Toplam (TL)"), T("Pay (%)"), T("İşlem"), T(`Aylık bütçe (TL)`), T(`Bütçe ayı harcaması (TL)`), T("Bütçe kullanımı (%)")]));
  for (const cat of s.categories) {
    const b = budgetByCat.get(cat.category);
    out.push(line([T(CATEGORIES[cat.category].label), N(cat.total), N(cat.share * 100, 1), N(cat.count, 0), N(b?.limit), N(b?.spent), N(b ? b.ratio * 100 : null, 1)]));
  }

  section("ABONELİKLER");
  out.push(line([T("Abonelik"), T("Kategori"), T("Aylık (TL)"), T("Yıllık (TL)"), T("Ödeme sayısı"), T("Son ödeme"), T("Zam (TL)"), T("Çakışma")]));
  for (const sub of s.subscriptions) {
    out.push(
      line([
        T(sub.merchant),
        T(CATEGORIES[sub.category].label),
        N(sub.monthlyAmount),
        N(sub.annualCost),
        N(sub.occurrences, 0),
        T(sub.lastDate),
        N(sub.priceIncrease),
        T(sub.overlapsWith.length && sub.serviceGroup ? `${SERVICE_GROUP_LABEL[sub.serviceGroup]}: ${sub.overlapsWith.join(", ")}` : ""),
      ]),
    );
  }

  section("BANKA KESİNTİLERİ");
  out.push(line([T("Tür"), T("Toplam (TL)"), T("Adet"), T("Yıllık karşılık (TL)")]));
  for (const f of s.fees) out.push(line([T(f.label), N(f.total), N(f.count, 0), N(f.annualized)]));

  if (analysis) {
    section("EKSTRE AVUKATI TAVSİYELERİ");
    out.push(line([T("Özet"), T(analysis.summary)]));
    out.push(line([T("No"), T("Başlık"), T("Tür"), T("Öncelik"), T("Yıllık tasarruf (TL)"), T("Ne yapmalı"), T("Dayanak")]));
    analysis.advice.forEach((a, i) => out.push(line([N(i + 1, 0), T(a.title), T(a.kind), T(a.priority), N(a.annualSaving), T(a.action), T(a.legalNote)])));

    if (analysis.findings.length) {
      section("TESPİTLER");
      out.push(line([T("Tür"), T("Başlık"), T("Tutar (TL)"), T("Ayrıntı")]));
      for (const f of analysis.findings) out.push(line([T(f.type), T(f.title), N(f.amount), T(f.detail)]));
    }
  }

  section("İŞLEMLER");
  out.push(line([T("Tarih"), T("İşyeri"), T("Kategori"), T("Tutar (TL)"), T("Tür"), T("Açıklama")]));
  for (const t of data.transactions) {
    out.push(line([T(t.date), T(t.merchant), T(CATEGORIES[t.category].label), N(t.amount), T(t.kind === "debit" ? "Harcama" : "Ödeme/iade"), T(t.description)]));
  }

  // Excel (Türkçe) için CRLF
  return out.join("\r\n") + "\r\n";
}

/** İstemcide indirme: UTF-8 BOM ile (Excel Türkçe karakterleri doğru açsın). */
export const CSV_BOM = "﻿";

export function reportFileName(scopeLabel: string, date: string): string {
  const slug = scopeLabel
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `ekstre-avukati-${slug || "rapor"}-${date}`;
}
