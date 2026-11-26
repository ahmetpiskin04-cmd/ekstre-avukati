import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { maskSensitiveData } from "../privacy-masker";
import { summarize } from "../statement/analyze";
import { cleanMerchant } from "../statement/merchant";
import { parseAmount, parseCsvStatement, parseDate, parsePdfLines } from "../statement/parse";

describe("parseAmount", () => {
  const cases: Array<[string, number | null]> = [
    ["1.234,56", 1234.56],
    ["-14.250,00", -14250],
    ["89,90 TL", 89.9],
    ["1,234.56", 1234.56],
    ["250,00-", -250],
    ["(45,10)", -45.1],
    ["1.250", 1250],
    ["12.50", 12.5],
    ["MIGROS", null],
    ["", null],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => assert.equal(parseAmount(input), expected));
  }
});

describe("parseDate", () => {
  it("Türk biçimlerini ISO'ya çevirir", () => {
    assert.equal(parseDate("15.08.2026"), "2026-08-15");
    assert.equal(parseDate("5/9/26"), "2026-09-05");
    assert.equal(parseDate("2026-10-03"), "2026-10-03");
    assert.equal(parseDate("3 Ağustos 2026"), "2026-08-03");
    assert.equal(parseDate("32.13.2026"), null);
  });
});

describe("cleanMerchant", () => {
  it("bilinen işyerlerini ve ödeme aracısı öneklerini temizler", () => {
    assert.equal(cleanMerchant("NETFLIX.COM AMSTERDAM NL"), "Netflix");
    assert.equal(cleanMerchant("IYZICO*TRENDYOL ISTANBUL TR"), "Trendyol");
    assert.equal(cleanMerchant("GOOGLE *YouTubePremium IE"), "YouTube Premium");
  });
  it("bilinmeyen işyerinde şehir/ülke/terminal kodunu atar", () => {
    assert.equal(cleanMerchant("ECZANE SIFA KADIKOY ISTANBUL TR"), "Eczane");
    assert.equal(cleanMerchant("KASAP ALI USTA 4412 ISTANBUL TR"), "Kasap Ali Usta");
  });
});

describe("örnek ekstre (public/ornek-ekstre.csv) uçtan uca", () => {
  const raw = readFileSync(join(process.cwd(), "public", "ornek-ekstre.csv"), "utf8");
  const { text, report } = maskSensitiveData(raw);
  const { transactions, warnings } = parseCsvStatement(text);
  const s = summarize(transactions);

  it("hassas verileri maskeler", () => {
    assert.deepEqual(report, { cards: 2, ibans: 2, nationalIds: 2 });
    assert.ok(transactions.every((t) => !/\d{11,}/.test(t.description.replace(/\s/g, ""))));
  });

  it("tüm işlem satırlarını okur, ödemeleri harcamadan ayırır", () => {
    assert.equal(transactions.length, 80);
    assert.equal(transactions.filter((t) => t.kind === "credit").length, 4);
    assert.deepEqual(warnings, []);
  });

  it("abonelikleri bulur, taksiti ve market alışverişini abonelik saymaz", () => {
    const names = s.subscriptions.map((x) => x.merchant);
    for (const n of ["Netflix", "Spotify", "YouTube Premium", "Disney+", "Apple (iCloud/App Store)", "ChatGPT Plus", "MACFit", "Turkcell"]) {
      assert.ok(names.includes(n), `${n} bulunamadı: ${names.join(", ")}`);
    }
    assert.ok(!names.some((n) => /Teknosa|Migros|İstanbulkart/.test(n)), names.join(", "));
  });

  it("Netflix zammını ve çakışan abonelikleri yakalar", () => {
    const netflix = s.subscriptions.find((x) => x.merchant === "Netflix")!;
    assert.equal(netflix.priceIncrease, 50);
    assert.deepEqual(netflix.overlapsWith, ["Disney+"]);
    assert.ok(s.savings.overlaps > 0);
  });

  it("banka kesintilerini türlerine ayırır", () => {
    const types = s.fees.map((f) => f.type).sort();
    assert.deepEqual(types, ["aidat", "faiz", "nakit-avans", "sms", "transfer", "vergi"]);
    const sms = s.fees.find((f) => f.type === "sms")!;
    assert.equal(sms.annualized, 42); // 3 ayda 3 x 3,50 -> yıllık 42
  });
});

describe("parsePdfLines", () => {
  it("satır sonundaki ilk tutarı alır, puan sütununu yok sayar", () => {
    const { transactions } = parsePdfLines([
      "HESAP ÖZETİ",
      "15.08.2026 MIGROS SUBE 123 ISTANBUL TR 1.234,56 12,34",
      "16.08.2026 14:22 SHELL ATASEHIR 1.850,00 TL",
      "17.08.2026 ODEMENIZ ICIN TESEKKUR EDERIZ -5.000,00",
      "Toplam 3.084,56",
    ]);
    assert.equal(transactions.length, 3);
    const migros = transactions.find((t) => t.merchant === "Migros")!;
    assert.equal(migros.amount, 1234.56);
    assert.equal(migros.category, "market");
    assert.equal(transactions.find((t) => t.merchant === "Shell")!.amount, 1850);
    assert.equal(transactions.filter((t) => t.kind === "credit").length, 1);
  });
});

describe("processStatement (public/ornek-ekstre.pdf) uçtan uca", () => {
  it("PDF tablosunu satırlara çevirir, maskeler ve CSV ile aynı sonucu verir", async () => {
    const { processStatement } = await import("../server/process-statement");
    const pdf = new Uint8Array(readFileSync(join(process.cwd(), "public", "ornek-ekstre.pdf")));
    const s = await processStatement("ornek-ekstre.pdf", pdf);
    assert.equal(s.fileType, "pdf");
    assert.deepEqual(s.maskReport, { cards: 2, ibans: 2, nationalIds: 2 });
    assert.equal(s.transactions.length, 80);
    const total = s.transactions.filter((t) => t.kind === "debit").reduce((a, t) => a + t.amount, 0);
    assert.equal(Math.round(total * 100) / 100, 46733.6);
    assert.ok(s.previewLines.every((l) => !/5528 7912|TR33 0006|10000000146/.test(l)));
  });

  it("PDF olmayan, uzantısı yanlış dosyayı reddeder", async () => {
    const { processStatement } = await import("../server/process-statement");
    await assert.rejects(processStatement("x.docx", new TextEncoder().encode("merhaba")), /Yalnızca PDF veya CSV/);
  });
});

describe("categorize — kelime sınırı", () => {
  it("TAKSİT kelimesini taksi (ulaşım) sanmaz", async () => {
    const { categorize } = await import("../statement/categories");
    assert.equal(categorize("TEKNOSA ATASEHIR TAKSİT 2/6"), "alisveris");
    assert.equal(categorize("KADIKOY TAKSI DURAGI"), "ulasim");
    assert.equal(categorize("HGS DOLUM"), "ulasim");
    assert.equal(categorize("BELBIM ISTANBULKART DOLUM"), "ulasim");
    assert.equal(categorize("BIM BIRLESIK MAGAZALAR"), "market");
    assert.equal(categorize("KARDESLER SUPERMARKET"), "market");
    assert.equal(categorize("ATM NAKIT CEKIM"), "nakit");
  });
});
