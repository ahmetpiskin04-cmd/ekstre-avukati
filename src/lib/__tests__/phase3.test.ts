import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { maskSensitiveData } from "../privacy-masker";
import { parseAnalysisOutput, uniqueDescriptions } from "../server/ai-analyze";
import { summarize } from "../statement/analyze";
import { alertingBudgets, budgetLevel, budgetStatuses, latestMonth, parseLimit, sanitizeBudgets } from "../statement/budget";
import { addStatement, ALL, mergeTransactions, migrateLegacy, pruneAnalyses, resolveScope } from "../statement/library";
import { parseCsvStatement } from "../statement/parse";
import { buildCsv, numCell, reportFileName, textCell, type ReportData } from "../statement/report";
import { adviceTotal, allocateSavings, savingCandidates } from "../statement/savings";
import { compareLatestMonths } from "../statement/trend";
import type { AiAnalysis, ParsedStatement, Transaction } from "../statement/types";

const PUB = join(process.cwd(), "public");
const load = (file: string) => parseCsvStatement(maskSensitiveData(readFileSync(join(PUB, file), "utf8")).text).transactions;
const demo = load("ornek-ekstre.csv");
const eylul = load("ornek-ekstre-eylul.csv");
const ekim = load("ornek-ekstre-ekim.csv");

const stmt = (fileName: string, transactions: Transaction[], id?: string): ParsedStatement => ({
  id,
  fileName,
  fileType: "csv",
  uploadedAt: "2026-11-21T10:00:00.000Z",
  previewLines: [],
  totalLines: 0,
  maskReport: { cards: 0, ibans: 0, nationalIds: 0 },
  transactions,
  warnings: [],
});

const tx = (p: Partial<Transaction>): Transaction => ({
  id: "x",
  date: "2026-10-01",
  description: "X",
  merchant: "X",
  category: "diger",
  amount: 100,
  kind: "debit",
  isBankFee: false,
  ...p,
});

/** Ham CSV'den bağımsız toplama (kodun kendisini kullanmadan): pozitif tutarlar = harcama */
function rawMonthTotal(file: string, mm: string): number {
  const rows = readFileSync(join(PUB, file), "utf8").split(/\r?\n/).filter((l) => new RegExp(`^\\d\\d\\.${mm}\\.2026;`).test(l));
  const sum = rows.map((r) => Number(r.split(";")[2].replace(/\./g, "").replace(",", "."))).filter((n) => n > 0).reduce((a, b) => a + b, 0);
  return Math.round(sum * 100) / 100;
}

/* ------------------------------------------------------------------ */

describe("tasarruf tekilleştirme (tavsiye toplamı)", () => {
  const s = summarize(demo);
  const candidates = savingCandidates(s);
  const amount = (key: string) => candidates.find((c) => c.key === key)!.annualAmount;

  it("adaylar kodla hesaplanan kesinti türleri ve çakışma gruplarıdır; toplamları tasarruf potansiyeline eşit", () => {
    const keys = candidates.map((c) => c.key).sort();
    assert.deepEqual(keys, ["fee:aidat", "fee:faiz", "fee:nakit-avans", "fee:sms", "fee:transfer", "fee:vergi", "overlap:muzik", "overlap:video"]);
    const sum = Math.round(candidates.reduce((a, c) => a + c.annualAmount, 0) * 100) / 100;
    assert.equal(sum, s.savings.total);
  });

  it("aynı kesinti iki maddede geçse de bir kez sayılır; bilinmeyen anahtar yok sayılır", () => {
    const { perAdvice, total } = allocateSavings(
      [
        ["fee:aidat", "fee:sms", "fee:transfer"],
        ["overlap:video", "overlap:muzik"],
        ["fee:sms", "fee:transfer", "uydurma:anahtar"], // 2. kez: yeni bir şey getirmiyor
        [],
      ],
      candidates,
    );
    const first = Math.round((amount("fee:aidat") + amount("fee:sms") + amount("fee:transfer")) * 100) / 100;
    assert.equal(perAdvice[0], first);
    assert.equal(perAdvice[2], null);
    assert.equal(perAdvice[3], null);
    assert.equal(total, Math.round((first + amount("overlap:video") + amount("overlap:muzik")) * 100) / 100);
    // Ekrandaki 2. aşama hatası: SMS/EFT iki kez sayılınca toplam ~77 TL şişiyordu
    const naive = first + amount("overlap:video") + amount("overlap:muzik") + amount("fee:sms") + amount("fee:transfer");
    assert.ok(naive - total > 70);
  });

  it("Gemini'nin yazdığı tasarruf sayısını yok sayar, anahtarlardan hesaplar", () => {
    const rows = uniqueDescriptions(demo);
    const out = parseAnalysisOutput(
      {
        merchants: rows.map((r) => ({ id: r.id, merchant: r.ruleMerchant, category: r.ruleCategory })),
        summary: "Özet",
        findings: [],
        advice: [
          { title: "Aidat", action: "Ara", legalNote: null, annualSaving: 99999, savingKeys: ["fee:aidat", "fee:aidat"], priority: "yuksek", kind: "itiraz" },
          { title: "Aidat yine", action: "Ara", legalNote: null, annualSaving: 5000, savingKeys: ["fee:aidat"], priority: "orta", kind: "pazarlik" },
          { title: "Alışkanlık", action: "Az ye", legalNote: null, savingKeys: ["yok:boyle"], priority: "dusuk", kind: "aliskanlik" },
        ],
      },
      rows,
      candidates,
    );
    assert.deepEqual(out.advice.map((a) => a.annualSaving), [amount("fee:aidat"), null, null]);
    assert.deepEqual(out.advice[2].savingKeys, []);
    assert.equal(out.totalAnnualSaving, amount("fee:aidat"));
  });

  it("eski kayıtlarda (toplam alanı yok) madde toplamına düşer", () => {
    const a = { advice: [{ annualSaving: 10 }, { annualSaving: null }, { annualSaving: 5.5 }] } as unknown as AiAnalysis;
    assert.equal(adviceTotal(a), 15.5);
    assert.equal(adviceTotal({ ...a, totalAnnualSaving: 7 }), 7);
  });
});

/* ------------------------------------------------------------------ */

describe("önceki aya göre değişim", () => {
  it("tek ayda karşılaştırma yapmaz", () => {
    assert.equal(compareLatestMonths(ekim), null);
  });

  it("Eylül + Ekim: toplam değişimi kesin hesaplar (ham CSV ile bağımsız doğrulama)", () => {
    const c = compareLatestMonths([...eylul, ...ekim])!;
    const sep = rawMonthTotal("ornek-ekstre-eylul.csv", "09");
    const oct = rawMonthTotal("ornek-ekstre-ekim.csv", "10");
    assert.equal(c.previousMonth, "2026-09");
    assert.equal(c.currentMonth, "2026-10");
    assert.equal(c.previousTotal, sep);
    assert.equal(c.currentTotal, oct);
    assert.equal(c.change, Math.round((oct - sep) * 100) / 100);
    assert.equal(c.changePct, Math.round(((oct - sep) / sep) * 1000) / 10);
    assert.equal(c.gap, false);
  });

  it("en çok artan en fazla 3 kategori, yalnızca artanlar, büyükten küçüğe", () => {
    const c = compareLatestMonths([...eylul, ...ekim])!;
    assert.ok(c.topIncreases.length <= 3 && c.topIncreases.length > 0);
    assert.ok(c.topIncreases.every((i) => i.change > 0 && Math.abs(i.current - i.previous - i.change) < 0.01));
    assert.deepEqual(
      c.topIncreases.map((i) => i.change),
      [...c.topIncreases.map((i) => i.change)].sort((a, b) => b - a),
    );
    // Ekim'de Eylül'de olmayan faturalar (Enerjisa, İGDAŞ) var: Faturalar en çok artanlar arasında
    assert.ok(c.topIncreases.some((i) => i.category === "fatura"));
  });

  it("Ekim'de ilk kez görülen aboneliği 'yeni' olarak yakalar", () => {
    const c = compareLatestMonths([...eylul, ...ekim])!;
    assert.deepEqual(c.newSubscriptions.map((s) => s.merchant), ["BluTV"]);
  });

  it("ardışık olmayan aylarda boşluğu bildirir, kategori yoksa yüzde null", () => {
    const c = compareLatestMonths([tx({ date: "2026-07-10", category: "market", amount: 100 }), tx({ date: "2026-09-10", category: "restoran", amount: 50 })])!;
    assert.equal(c.gap, true);
    assert.equal(c.changePct, -50);
    assert.equal(c.topIncreases[0].changePct, null);
  });
});

/* ------------------------------------------------------------------ */

describe("bütçe hedefleri", () => {
  it("limit girdisini Türkçe biçimlerle okur", () => {
    assert.equal(parseLimit("5.000"), 5000);
    assert.equal(parseLimit("5000"), 5000);
    assert.equal(parseLimit("2.500,50"), 2500.5);
    assert.equal(parseLimit("₺ 3.000 TL"), 3000);
    assert.equal(parseLimit("12,5"), 12.5);
    assert.equal(parseLimit(""), null);
    assert.equal(parseLimit("0"), null);
    assert.equal(parseLimit("abc"), null);
    assert.equal(parseLimit("-100"), null);
  });

  it("%80'de uyarı, %100'de aşım", () => {
    assert.equal(budgetLevel(799, 1000), "ok");
    assert.equal(budgetLevel(800, 1000), "warn");
    assert.equal(budgetLevel(999.99, 1000), "warn");
    assert.equal(budgetLevel(1000, 1000), "over");
  });

  it("son ayın harcamasına göre durum hesaplar, en dolu kategori başta", () => {
    assert.equal(latestMonth(demo), "2026-10");
    const st = budgetStatuses(demo, { market: 3000, restoran: 10_000, fatura: 2000 });
    // Ekim 2026 market: Migros 1.618,70 + ŞOK 334,40 + Migros 1.105,60 = 3.058,70
    const market = st.find((s) => s.category === "market")!;
    assert.equal(market.spent, 3058.7);
    assert.equal(market.level, "over");
    assert.equal(st[0].category, "market");
    assert.deepEqual(alertingBudgets(st).map((s) => s.category), ["market", "fatura"]);
  });

  it("bozuk depolama verisini temizler", () => {
    assert.deepEqual(sanitizeBudgets({ market: 5000, uydurma: 10, restoran: -5, fatura: "100", giyim: 1250.555 }), { market: 5000, giyim: 1250.56 });
    assert.deepEqual(sanitizeBudgets(null), {});
    assert.deepEqual(sanitizeBudgets([1, 2]), {});
  });
});

/* ------------------------------------------------------------------ */

describe("çoklu ekstre kütüphanesi", () => {
  it("aynı dosya adını yeniden yüklemek eskisinin yerine geçer", () => {
    let { lib } = addStatement([], stmt("eylul.csv", eylul));
    ({ lib } = addStatement(lib, stmt("ekim.csv", ekim)));
    const again = addStatement(lib, stmt("eylul.csv", eylul.slice(0, 3)));
    assert.equal(again.lib.length, 2);
    assert.equal(again.lib[1].fileName, "eylul.csv");
    assert.equal(again.lib[1].transactions.length, 3);
    assert.ok(again.lib.every((s) => typeof s.id === "string"));
  });

  it("birleştirme: ayrı aylar toplanır, örtüşen ekstre işlemleri ikiye katlamaz", () => {
    const a = stmt("eylul.csv", eylul, "a");
    const b = stmt("ekim.csv", ekim, "b");
    assert.equal(mergeTransactions([a, b]).length, eylul.length + ekim.length);
    // 3 aylık ekstre + Eylül ekstresi: Eylül işlemleri tekrar sayılmamalı
    const full = stmt("ornek-ekstre.csv", demo, "c");
    assert.equal(mergeTransactions([full, a]).length, demo.length);
    assert.equal(mergeTransactions([full, a, b]).length, demo.length + 1); // +1: yalnızca Ekim dosyasındaki BluTV
  });

  it("aynı gün iki özdeş işlem tek ekstrede varsa ikisi de korunur", () => {
    const sms = tx({ description: "SMS ÜCRETİ", amount: 3.5 });
    const one = stmt("a.csv", [sms, { ...sms, id: "y" }], "a");
    const two = stmt("b.csv", [sms], "b");
    assert.equal(mergeTransactions([one, two]).length, 2);
  });

  it("görünüm: 'all' en az 2 ekstrede birleşik; geçersiz seçimde en son ekstre", () => {
    const lib = [stmt("eylul.csv", eylul, "a"), stmt("ekim.csv", ekim, "b")];
    const all = resolveScope(lib, ALL)!;
    assert.equal(all.combined, true);
    assert.equal(all.key, "all:a|b");
    assert.equal(all.transactions.length, eylul.length + ekim.length);
    assert.equal(resolveScope(lib, "a")!.statements[0].fileName, "eylul.csv");
    assert.equal(resolveScope(lib, "silinmis")!.key, "b");
    assert.equal(resolveScope([lib[0]], ALL)!.combined, false);
    assert.equal(resolveScope([], ALL), null);
  });

  it("silinen ekstreye bağlı (tek veya birleşik) analizleri temizler", () => {
    const a = {} as AiAnalysis;
    const kept = pruneAnalyses({ a, b: a, "all:a|b": a, "all:a|c": a }, [stmt("x", [], "a"), stmt("y", [], "b")]);
    assert.deepEqual(Object.keys(kept).sort(), ["a", "all:a|b", "b"]);
  });

  it("v1 tek ekstre kaydını kimlik vererek taşır, analizi ayırır", () => {
    const analysis = { model: "m" } as AiAnalysis;
    const { statement, analysis: moved } = migrateLegacy({ ...stmt("eski.csv", eylul), analysis });
    assert.ok(statement.id);
    assert.equal(statement.analysis, undefined);
    assert.equal(moved, analysis);
  });
});

/* ------------------------------------------------------------------ */

describe("KPI trend etiketleri", () => {
  it("tek ayda etiket yok; iki ayda toplam ve kategori değişimi trend paneliyle aynı", async () => {
    const { kpiTrends } = await import("../statement/kpi");
    assert.equal(kpiTrends(ekim), null);
    const k = kpiTrends([...eylul, ...ekim])!;
    const c = compareLatestMonths([...eylul, ...ekim])!;
    assert.equal(k.total, c.changePct);
    assert.equal(k.category("fatura"), c.topIncreases.find((i) => i.category === "fatura")!.changePct);
    assert.equal(k.category("egitim"), -100); // Eylül'de Udemy var, Ekim'de yok
    assert.equal(k.category("saglik"), null); // Eylül'de 0, Ekim'de var → "yeni"
    assert.equal(k.category("nakit"), -100); // Eylül'deki ATM nakit avans
    assert.equal(k.category("diger"), null); // Ekim'deki GİB ödemesi
    assert.equal(kpiTrends([tx({ date: "2026-09-01", category: "market" }), tx({ date: "2026-10-01", category: "market" })])!.category("giyim"), undefined);
  });
});

describe("CSV dışa aktarma", () => {
  it("Excel formül enjeksiyonuna karşı metin hücrelerini korur, ; ve tırnağı kaçışlar", () => {
    assert.equal(textCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
    assert.equal(textCell("+90 555"), "'+90 555");
    assert.equal(textCell("@SUM"), "'@SUM");
    assert.equal(textCell("A;B"), '"A;B"');
    assert.equal(textCell("satır\nsonu"), "satır sonu");
    assert.equal(textCell("Migros"), "Migros");
  });

  it("sayılar Türkçe ondalık virgülle, binlik ayracı olmadan; negatif sayı metin gibi bozulmaz", () => {
    assert.equal(numCell(1234.5), "1234,50");
    assert.equal(numCell(-12.345, 1), "-12,3");
    assert.equal(numCell(null), "");
  });

  const s = summarize(demo);
  const data: ReportData = {
    generatedAt: "2026-11-22",
    scopeLabel: "Örnek Ekstre",
    summary: s,
    comparison: compareLatestMonths(demo),
    budgetMonth: "2026-10",
    budgets: budgetStatuses(demo, { market: 3000 }),
    analysis: {
      model: "gemini-test",
      createdAt: "2026-11-22",
      summary: "Özet; noktalı virgüllü",
      findings: [{ type: "banka-masrafi", title: "Aidat", detail: "Kesildi", amount: 1250 }],
      advice: [{ title: "=İtiraz", action: "Bankayı ara", legalNote: null, savingKeys: ["fee:aidat"], annualSaving: 1250, priority: "yuksek", kind: "itiraz" }],
      changedTransactions: 4,
      totalAnnualSaving: 1250,
    },
    transactions: [...demo, tx({ description: "=cmd|' /C calc'!A0", merchant: "-Kötü" })],
  };
  const csv = buildCsv(data);
  const lines = csv.split("\r\n");

  it("tüm bölümleri içerir, CRLF ile biter", () => {
    for (const sec of ["ÖZET", "ÖNCEKİ AYA GÖRE DEĞİŞİM", "KATEGORİLER", "ABONELİKLER", "BANKA KESİNTİLERİ", "EKSTRE AVUKATI TAVSİYELERİ", "TESPİTLER", "İŞLEMLER"]) {
      assert.ok(lines.includes(sec), sec);
    }
    assert.ok(csv.endsWith("\r\n"));
    assert.ok(!csv.startsWith("﻿")); // BOM indirme sırasında eklenir
  });

  it("rakamlar özetle birebir, tavsiye toplamı tekilleştirilmiş değer", () => {
    assert.ok(lines.includes(`Toplam harcama (TL);${numCell(s.totalSpending)}`));
    assert.ok(lines.includes("Tavsiyelerle tekilleştirilmiş tasarruf, yıllık (TL);1250,00"));
    assert.ok(lines.some((l) => l.startsWith("Market;") && l.endsWith(";3000,00;3058,70;102,0")));
  });

  it("işlem satır sayısı birebir ve kötü niyetli hücreler etkisiz", () => {
    const start = lines.indexOf("İŞLEMLER") + 2;
    assert.equal(lines.slice(start).filter(Boolean).length, data.transactions.length);
    assert.ok(csv.includes(`"'=cmd|' /C calc'!A0"`) || csv.includes(`'=cmd|' /C calc'!A0`));
    assert.ok(csv.includes(";'-Kötü;"));
    assert.ok(csv.includes(`'=İtiraz`));
    assert.doesNotMatch(csv, /5528 7912|10000000146|TR33 0006/);
  });

  it("dosya adı Türkçe karaktersiz ve güvenli", () => {
    assert.equal(reportFileName("Tüm ekstreler (2)", "2026-11-22"), "ekstre-avukati-tum-ekstreler-2-2026-11-22");
    assert.equal(reportFileName("***", "2026-11-22"), "ekstre-avukati-rapor-2026-11-22");
  });
});
