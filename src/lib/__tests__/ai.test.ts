import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { maskSensitiveData } from "../privacy-masker";
import { buildAnalysisPrompt, parseAnalysisOutput, uniqueDescriptions } from "../server/ai-analyze";
import { toGeminiContents } from "../server/ai-chat";
import { parseVisionOutput } from "../server/pdf-vision";
import { BadRequestError, readChatMessages, readTransactions } from "../server/validate";
import { summarize } from "../statement/analyze";
import { applyMerchantFixes } from "../statement/enrich";
import { buildFactsText, categorySpikes, transactionsTable, weekdayStats } from "../statement/facts";
import { parseCsvStatement } from "../statement/parse";
import type { Transaction } from "../statement/types";

const demo = (() => {
  const raw = readFileSync(join(process.cwd(), "public", "ornek-ekstre.csv"), "utf8");
  return parseCsvStatement(maskSensitiveData(raw).text).transactions;
})();

const tx = (p: Partial<Transaction>): Transaction => ({
  id: "x",
  date: "2026-08-01",
  description: "X",
  merchant: "X",
  category: "diger",
  amount: 100,
  kind: "debit",
  isBankFee: false,
  ...p,
});

describe("weekdayStats", () => {
  it("takvim günlerini sayıp hafta sonu/hafta içi günlük ortalamasını hesaplar", () => {
    // 2026-08-01 Cumartesi, 08-02 Pazar, 08-03 Pazartesi ... 08-07 Cuma (1 hafta)
    const w = weekdayStats([
      tx({ date: "2026-08-01", amount: 300 }),
      tx({ date: "2026-08-02", amount: 100 }),
      tx({ date: "2026-08-03", amount: 250 }),
      tx({ date: "2026-08-07", amount: 250 }),
      tx({ date: "2026-08-05", amount: 999, kind: "credit" }), // ödeme sayılmaz
    ]);
    assert.equal(w.weekend.total, 400);
    assert.equal(w.weekend.calendarDays, 2);
    assert.equal(w.weekend.perDay, 200);
    assert.equal(w.weekday.total, 500);
    assert.equal(w.weekday.calendarDays, 5);
    assert.equal(w.weekday.perDay, 100);
    assert.equal(w.weekendVsWeekdayPerDayPct, 100);
    assert.equal(w.weekendVsWeekdayTotalPct, -20);
  });
});

describe("categorySpikes", () => {
  it("önceki aya göre belirgin artışı bulur, küçük farkı yok sayar", () => {
    const spikes = categorySpikes([
      tx({ date: "2026-08-10", category: "restoran", amount: 500 }),
      tx({ date: "2026-09-10", category: "restoran", amount: 1500 }),
      tx({ date: "2026-08-10", category: "market", amount: 1000 }),
      tx({ date: "2026-09-10", category: "market", amount: 1100 }),
    ]);
    assert.equal(spikes.length, 1);
    assert.equal(spikes[0].category, "restoran");
    assert.equal(spikes[0].changePct, 200);
  });
});

describe("buildFactsText / transactionsTable (örnek ekstre)", () => {
  const facts = buildFactsText(demo, summarize(demo));
  it("kesin rakamları içerir ve maskeli veriyi açmaz", () => {
    assert.match(facts, /Toplam harcama: ₺46\.733,60/);
    assert.match(facts, /Netflix .*zam: ₺229,99 → ₺279,99/);
    assert.match(facts, /Hafta sonu GÜNLÜK ortalaması hafta içine göre: [+-]%\d+(,\d)?\n/);
    assert.doesNotMatch(facts + transactionsTable(demo), /5528 7912|5528791234561234|TR33 0006|10000000146/);
  });
  it("işlem tablosunda her işlem bir satır", () => {
    assert.equal(transactionsTable(demo).split("\n").length, demo.length + 1);
  });
});

describe("analiz: açıklama listesi ve çıktı doğrulama", () => {
  const rows = uniqueDescriptions(demo);
  it("yalnızca harcama açıklamalarını tekilleştirir ve kimlik verir", () => {
    assert.ok(rows.length > 30 && rows.length < demo.length);
    assert.deepEqual(rows.map((r) => r.id).slice(0, 3), [1, 2, 3]);
    assert.ok(!rows.some((r) => /TEŞEKKÜR/.test(r.description)));
    const prompt = buildAnalysisPrompt(demo, rows);
    assert.match(prompt, /KESİN RAKAMLAR/);
    assert.doesNotMatch(prompt, /5528791234561234|10000000146/);
  });

  const goodOutput = {
    merchants: rows.map((r) => ({ id: r.id, merchant: r.ruleMerchant, category: r.ruleCategory })),
    summary: "Özet.",
    findings: [{ type: "banka-masrafi", title: "Aidat", detail: "Yıllık kart aidatı kesilmiş.", amount: 1250 }],
    advice: [1, 2, 3].map((i) => ({ title: `T${i}`, action: "Bankayı ara.", legalNote: null, annualSaving: 100 * i, priority: "yuksek", kind: "itiraz" })),
  };

  it("geçerli çıktıyı kabul eder, geçersiz kategori/kimliği eler", () => {
    const out = parseAnalysisOutput(
      { ...goodOutput, merchants: [...goodOutput.merchants, { id: 9999, merchant: "Uydurma", category: "market" }], findings: [{ type: "uydurma-tur", title: "A", detail: "B", amount: -5 }] },
      rows,
    );
    assert.equal(out.merchantFixes.length, rows.length);
    assert.equal(out.findings[0].type, "diger");
    assert.equal(out.findings[0].amount, null);
    assert.equal(out.advice.length, 3);
  });

  it("3'ten az tavsiye veya yarım kalmış işyeri listesini reddeder (yeniden denensin)", () => {
    assert.throws(() => parseAnalysisOutput({ ...goodOutput, advice: goodOutput.advice.slice(0, 2) }, rows), /tavsiye/);
    assert.throws(() => parseAnalysisOutput({ ...goodOutput, merchants: goodOutput.merchants.slice(0, 5) }, rows), /eksik/);
  });

  it("5'ten fazla tavsiyeyi 5'e kırpar", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...goodOutput.advice[0], title: `T${i}` }));
    assert.equal(parseAnalysisOutput({ ...goodOutput, advice: many }, rows).advice.length, 5);
  });
});

describe("applyMerchantFixes", () => {
  it("adı/kategoriyi değiştirir, tutar ve yönü korur, kural tabanlı kesintiyi ezdirmez", () => {
    const txs = [
      tx({ id: "a", description: "MGROS TIC. A.S. 3412", merchant: "Mgros Tic. A.s.", category: "diger" }),
      tx({ id: "b", description: "YILLIK KART ÜCRETİ", merchant: "Yıllık Kart Ücreti", category: "banka", isBankFee: true }),
      tx({ id: "c", description: "ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ", kind: "credit" }),
    ];
    const { transactions, changed } = applyMerchantFixes(txs, [
      { description: "MGROS TIC. A.S. 3412", merchant: "Migros", category: "market" },
      { description: "YILLIK KART ÜCRETİ", merchant: "Kart Aidatı", category: "diger" },
      { description: "ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ", merchant: "Ödeme", category: "nakit" },
    ]);
    assert.equal(changed, 2);
    assert.deepEqual([transactions[0].merchant, transactions[0].category, transactions[0].amount, transactions[0].aiEnriched], ["Migros", "market", 100, true]);
    assert.equal(transactions[1].category, "banka");
    assert.equal(transactions[1].isBankFee, true);
    assert.equal(transactions[2], txs[2]); // ödeme satırına dokunulmaz
  });

  it("kural sözlüğünün tanıdığı markada ad ve kategori kuraldan gelir", () => {
    const { transactions } = applyMerchantFixes(
      [
        tx({ description: "TEKNOSA ATASEHIR TAKSİT 2/6", merchant: "Teknosa", category: "alisveris" }),
        tx({ description: "DISNEYPLUS AMSTERDAM NL", merchant: "Disney+", category: "dijital" }),
      ],
      [
        { description: "TEKNOSA ATASEHIR TAKSİT 2/6", merchant: "Teknosa (taksit)", category: "ulasim" },
        { description: "DISNEYPLUS AMSTERDAM NL", merchant: "Disney setup", category: "dijital" }, // canlı testte görülen hatalı ad
      ],
    );
    assert.equal(transactions[0].category, "alisveris");
    assert.equal(transactions[0].merchant, "Teknosa");
    assert.equal(transactions[1].merchant, "Disney+");
  });

  it("tanınmayan işyerinde adı yapay zekâdan alır", () => {
    const { transactions } = applyMerchantFixes(
      [tx({ description: "PAYTR*KUCUK DUKKAN 0042", merchant: "Kucuk Dukkan 0042" })],
      [{ description: "PAYTR*KUCUK DUKKAN 0042", merchant: "Küçük Dükkan", category: "alisveris" }],
    );
    assert.equal(transactions[0].merchant, "Küçük Dükkan");
    assert.equal(transactions[0].category, "alisveris");
  });
});

describe("abonelik gruplama ayrı analizlere dayanıklı", () => {
  it("aynı açıklamaya iki ekstrede farklı yapay zekâ adı verilse de tek abonelik sayılır", () => {
    const subs = summarize([
      tx({ date: "2026-09-11", description: "ACME STREAM SERVIS IE", merchant: "Acme Stream", category: "dijital", amount: 120 }),
      tx({ date: "2026-10-11", description: "ACME STREAM SERVIS IE", merchant: "ACME Yayın", category: "dijital", amount: 120 }),
    ]).subscriptions;
    assert.equal(subs.length, 1);
    assert.equal(subs[0].months, 2);
    assert.equal(subs[0].merchant, "ACME Yayın"); // görünen ad: en son işlemdeki ad
  });
});

describe("parseVisionOutput", () => {
  it("yalnızca tarihle başlayan satırları alır, kod bloğu ve madde işaretini temizler", () => {
    const lines = parseVisionOutput("```\nİşte satırlar:\n- 03.08.2026 NETFLIX.COM 229,99\n04.08.2026 SPOTIFY 99,99\nToplam 329,98\n```");
    assert.deepEqual(lines, ["03.08.2026 NETFLIX.COM 229,99", "04.08.2026 SPOTIFY 99,99"]);
  });
  it("ISLEM_YOK boş liste döner; anlamsız çıktı hata fırlatır", () => {
    assert.deepEqual(parseVisionOutput("ISLEM_YOK"), []);
    assert.throws(() => parseVisionOutput("Üzgünüm, okuyamadım."));
  });
});

describe("istemci girdisi doğrulama", () => {
  it("işlemleri doğrular ve metin alanlarını sunucuda yeniden maskeler", () => {
    const [t] = readTransactions([{ id: "1", date: "2026-08-01", description: "KART 4543600299991234 TR330006100519786457841326", merchant: "X 10000000146", category: "uydurma", amount: 12.345, kind: "debit", isBankFee: false }]);
    assert.equal(t.description, "KART **** **** **** 1234 [GİZLİ_VERİ]");
    assert.equal(t.merchant, "X [GİZLİ_VERİ]");
    assert.equal(t.category, "diger");
    assert.equal(t.amount, 12.35);
  });
  it("bozuk işlemi reddeder", () => {
    assert.throws(() => readTransactions([{ date: "01.08.2026", description: "x", amount: 1 }]), BadRequestError);
    assert.throws(() => readTransactions([]), BadRequestError);
  });
  it("sohbet: soruyu maskeler, hatalı mesajları atar, son mesaj kullanıcı olmalı", () => {
    const msgs = readChatMessages([
      { role: "assistant", text: "Merhaba" },
      { role: "user", text: "Kartım 5528 7912 3456 1234 neden?" },
      { role: "assistant", text: "Hata", error: true },
      { role: "user", text: "Toplam ne?" },
    ]);
    assert.equal(msgs.length, 3);
    assert.equal(msgs[1].text, "Kartım **** **** **** 1234 neden?");
    assert.throws(() => readChatMessages([{ role: "assistant", text: "x" }]), BadRequestError);
  });
  it("Gemini geçmişi kullanıcı mesajıyla başlar, assistant → model olur", () => {
    const contents = toGeminiContents([
      { role: "assistant", text: "Merhaba" },
      { role: "user", text: "Soru" },
      { role: "assistant", text: "Cevap" },
      { role: "user", text: "Soru 2" },
    ]);
    assert.deepEqual(contents.map((c) => c.role), ["user", "model", "user"]);
  });
});

describe("taranmış PDF (public/ornek-taranmis-ekstre.pdf)", () => {
  it("metin yoksa onay olmadan Gemini'ye gönderilmez: needsVision döner", async () => {
    const saved = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-anahtari";
    try {
      const { processStatement } = await import("../server/process-statement");
      const bytes = new Uint8Array(readFileSync(join(process.cwd(), "public", "ornek-taranmis-ekstre.pdf")));
      const size = bytes.byteLength;
      const s = await processStatement("taranmis.pdf", bytes);
      // pdf.js tamponu boşaltmamalı: aynı baytlar görsel okumaya gidecek
      assert.equal(bytes.byteLength, size);
      assert.equal(s.needsVision, true);
      assert.equal(s.transactions.length, 0);
      assert.match(s.warnings[0], /taranmış/);
    } finally {
      if (saved === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = saved;
    }
  });
});
