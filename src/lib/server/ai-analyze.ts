import "@/lib/server-guard";
import { SchemaType, type EnumStringSchema, type ResponseSchema } from "@google/generative-ai";
import { summarize } from "@/lib/statement/analyze";
import { CATEGORIES } from "@/lib/statement/categories";
import { buildFactsText } from "@/lib/statement/facts";
import { allocateSavings, savingCandidates, type SavingCandidate } from "@/lib/statement/savings";
import type {
  AdviceKind,
  AdvicePriority,
  AiAdvice,
  AiFinding,
  AnalyzeResponse,
  CategoryId,
  FindingType,
  MerchantFix,
  Transaction,
} from "@/lib/statement/types";
import { generateJson } from "./gemini";

const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];
const FINDING_TYPES: FindingType[] = ["gizli-abonelik", "banka-masrafi", "faiz", "harcama-artisi", "cakisan-abonelik", "fiyat-artisi", "diger"];
const ADVICE_KINDS: AdviceKind[] = ["itiraz", "iptal", "pazarlik", "aliskanlik"];
const PRIORITIES: AdvicePriority[] = ["yuksek", "orta", "dusuk"];
/** Bu kadardan fazla benzersiz açıklama varsa en yüksek tutarlılar gönderilir. */
const MAX_DESCRIPTIONS = 300;

const enumStr = (values: string[]): EnumStringSchema => ({ type: SchemaType.STRING, format: "enum", enum: values });

function buildSchema(savingKeys: string[]): ResponseSchema {
  return {
  type: SchemaType.OBJECT,
  properties: {
    merchants: {
      type: SchemaType.ARRAY,
      description: "Her açıklama kimliği için temizlenmiş işyeri adı ve kategori",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.INTEGER },
          merchant: { type: SchemaType.STRING, description: "Temiz marka/işyeri adı, ör. Migros, Netflix, Shell" },
          category: enumStr(CATEGORY_IDS),
        },
        required: ["id", "merchant", "category"],
      },
    },
    summary: { type: SchemaType.STRING, description: "2-3 cümlelik genel değerlendirme" },
    findings: {
      type: SchemaType.ARRAY,
      maxItems: 8,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: enumStr(FINDING_TYPES),
          title: { type: SchemaType.STRING },
          detail: { type: SchemaType.STRING },
          amount: { type: SchemaType.NUMBER, nullable: true, description: "İlgili TL tutarı; yoksa null" },
        },
        required: ["type", "title", "detail", "amount"],
      },
    },
    advice: {
      type: SchemaType.ARRAY,
      minItems: 3,
      maxItems: 5,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          action: { type: SchemaType.STRING, description: "Somut adımlar: kimi arayacak, ne diyecek, hangi menüden iptal edecek" },
          legalNote: { type: SchemaType.STRING, nullable: true },
          savingKeys: {
            type: SchemaType.ARRAY,
            description: "Bu maddenin tasarruf ettireceği, verilen anahtar listesinden kalemler (yoksa boş dizi)",
            items: savingKeys.length ? enumStr(savingKeys) : { type: SchemaType.STRING },
          },
          priority: enumStr(PRIORITIES),
          kind: enumStr(ADVICE_KINDS),
        },
        required: ["title", "action", "legalNote", "savingKeys", "priority", "kind"],
      },
    },
  },
  required: ["merchants", "summary", "findings", "advice"],
  };
}

const SYSTEM = `Sen "Ekstre Avukatı"sın: Türk bankacılığı ve tüketici hakları konusunda uzman, her zaman kullanıcının tarafını tutan bir kişisel finans danışmanısın.
Sana maskelenmiş bir kredi kartı/banka ekstresinden çıkarılmış işlem açıklamaları ve KODLA HESAPLANMIŞ kesin rakamlar verilecek.

GÖREVLER
1) merchants — Listedeki HER kimlik için:
   - merchant: temiz, anlaşılır marka/işyeri adı. Ödeme aracısı öneklerini (IYZICO, PAYTR, PARAM, SIPAY, PAPARA, GOOGLE *, APPLE.COM/BILL), şube/terminal/POS kodlarını, şehir/ülke eklerini ve "TIC. A.Ş.", "LTD. ŞTİ.", "SAN." gibi şirket eklerini at. Bilinen markayı doğru yazımıyla ver (MGROS TIC. A.S. 3412 → Migros, PAYTR*XYZ → açıklamadaki asıl satıcı). Emin olmadığın markayı uydurma; açıklamadaki en anlamlı adı Türkçe başlık harfleriyle yaz.
   - category: market (süpermarket, bakkal, online market) · restoran (Yeme-İçme: restoran, kafe, yemek siparişi) · dijital (Abonelik: yayın, müzik, bulut, yazılım, yapay zekâ servisleri) · fatura (telefon, internet, elektrik, su, doğalgaz) · ulasim (yakıt, toplu taşıma, taksi, otopark, uçak/otobüs bileti) · alisveris (e-ticaret, elektronik, ev, kozmetik) · giyim (giyim, ayakkabı, aksesuar) · saglik · eglence (sinema, konser, spor salonu) · egitim · banka (YALNIZCA bankanın kestiği ücret, faiz, BSMV/KKDF, aidat, komisyon) · nakit (ATM, nakit avans ANAPARASI, para transferi) · diger.
2) findings — Verilen rakamlara dayanarak: gizli/unutulmuş abonelikler, gereksiz banka masrafları ve faizler, abonelik fiyat artışları, aynı türde çakışan abonelikler, önceki aya göre olağandışı harcama artışları. Her bulgu: kısa başlık + 1-2 cümle ayrıntı + ilgili tutar.
3) advice — 3 ila 5 maddelik "Ekstre Avukatı Tavsiyesi & İtiraz/İptal Rehberi". En yüksek tasarruftan başla. Her madde kullanıcının BUGÜN uygulayabileceği somut adım içersin (hangi kanaldan, ne talep edeceği, hangi uygulama menüsünden iptal edeceği).
   - kind: itiraz (ücret/faiz iadesi talebi) · iptal (abonelik iptali) · pazarlık (bankayla/operatörle pazarlık, aidatsız karta geçiş) · aliskanlik (harcama alışkanlığı).
   - savingKeys: maddenin tasarruf ettireceği kalemleri KULLANILABİLİR TASARRUF ANAHTARLARI listesinden seç (ör. "fee:aidat"). Tasarruf TL'si YAZMA; tutarı sistem bu anahtarlardan hesaplar. Aynı anahtarı birden fazla maddede kullanma: her kalem tek bir maddeye ait olsun. Tasarrufu olmayan (genel alışkanlık) maddelerde boş dizi ver.
   - İade/itiraz sonucunu garanti etme: "iade edilir" değil "iadesini talep edebilirsin" de.
4) summary — 2-3 cümlelik genel değerlendirme.

KURALLAR
- Rakam uydurma. Yalnızca verilen rakamları kullan ya da onlardan basit toplama/çarpma ile türet. Bir bulgunun amount'u, detail'de saydığın kalemlerin verilen tutarlarının tam toplamı olmalı; tarihleri de verilen listeden al.
- Ödeme/iade satırları harcama değildir.
- Tüm metinler Türkçe, "sen" diliyle, samimi ama profesyonel. Tutarları "1.234,56 ₺" biçiminde yaz.
- [GİZLİ_VERİ] ve **** ile maskelenmiş alanları olduğu gibi bırak; açmaya çalışma.`;

interface DescriptionRow {
  id: number;
  description: string;
  count: number;
  total: number;
  ruleMerchant: string;
  ruleCategory: CategoryId;
}

export function uniqueDescriptions(txs: Transaction[]): DescriptionRow[] {
  const map = new Map<string, DescriptionRow>();
  for (const t of txs) {
    if (t.kind !== "debit") continue;
    const row = map.get(t.description) ?? { id: 0, description: t.description, count: 0, total: 0, ruleMerchant: t.merchant, ruleCategory: t.category };
    row.count++;
    row.total = Math.round((row.total + t.amount) * 100) / 100;
    map.set(t.description, row);
  }
  return [...map.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_DESCRIPTIONS)
    .map((r, i) => ({ ...r, id: i + 1 }));
}

export function buildAnalysisPrompt(txs: Transaction[], rows: DescriptionRow[], candidates: SavingCandidate[] = []): string {
  const facts = buildFactsText(txs, summarize(txs));
  const list = rows
    .map((r) => `${r.id} | ${r.description} | ${r.count} işlem | toplam ${r.total.toFixed(2)} TL | kural tahmini: ${r.ruleMerchant} / ${r.ruleCategory}`)
    .join("\n");
  const keys = candidates.length
    ? candidates.map((c) => `${c.key} — ${c.label} (yıllık ${c.annualAmount.toFixed(2)} TL)`).join("\n")
    : "(yok: hiçbir maddeye anahtar verme)";
  return `# KESİN RAKAMLAR (kodla hesaplandı)\n${facts}\n\n# KULLANILABİLİR TASARRUF ANAHTARLARI (savingKeys için)\n${keys}\n\n# İŞYERİ AÇIKLAMALARI (kimlik | maskeli açıklama | adet | toplam | kural tahmini)\n${list}`;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e8 ? Math.round(v * 100) / 100 : null);

/** Gemini çıktısını doğrular. Geçersizse Error fırlatır (aynı model bir kez daha dener). */
export function parseAnalysisOutput(raw: unknown, rows: DescriptionRow[], candidates: SavingCandidate[] = []): Omit<AnalyzeResponse, "model"> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const merchantFixes: MerchantFix[] = [];
  for (const m of Array.isArray(o.merchants) ? o.merchants : []) {
    const item = (m ?? {}) as Record<string, unknown>;
    const row = typeof item.id === "number" ? byId.get(item.id) : undefined;
    const merchant = text(item.merchant, 60);
    if (!row || !merchant) continue;
    const category = CATEGORY_IDS.includes(item.category as CategoryId) ? (item.category as CategoryId) : row.ruleCategory;
    merchantFixes.push({ description: row.description, merchant, category });
  }
  // Çıktı yarıda kesildiyse (ör. token sınırı) çoğu satır eksik kalır: yeniden dene.
  if (rows.length > 0 && merchantFixes.length < rows.length * 0.6) {
    throw new Error(`İşyeri listesi eksik (${merchantFixes.length}/${rows.length})`);
  }

  const findings: AiFinding[] = (Array.isArray(o.findings) ? o.findings : [])
    .map((f): AiFinding | null => {
      const item = (f ?? {}) as Record<string, unknown>;
      const title = text(item.title, 120);
      const detail = text(item.detail, 500);
      if (!title || !detail) return null;
      const type = FINDING_TYPES.includes(item.type as FindingType) ? (item.type as FindingType) : "diger";
      return { type, title, detail, amount: money(item.amount) };
    })
    .filter((f): f is AiFinding => f !== null)
    .slice(0, 8);

  const validKeys = new Set(candidates.map((c) => c.key));
  const rawAdvice: AiAdvice[] = (Array.isArray(o.advice) ? o.advice : [])
    .map((a): AiAdvice | null => {
      const item = (a ?? {}) as Record<string, unknown>;
      const title = text(item.title, 140);
      const action = text(item.action, 800);
      if (!title || !action) return null;
      return {
        title,
        action,
        legalNote: text(item.legalNote, 400) || null,
        savingKeys: (Array.isArray(item.savingKeys) ? item.savingKeys : []).filter((k): k is string => typeof k === "string" && validKeys.has(k)),
        annualSaving: null,
        priority: PRIORITIES.includes(item.priority as AdvicePriority) ? (item.priority as AdvicePriority) : "orta",
        kind: ADVICE_KINDS.includes(item.kind as AdviceKind) ? (item.kind as AdviceKind) : "aliskanlik",
      };
    })
    .filter((a): a is AiAdvice => a !== null)
    .slice(0, 5);
  if (rawAdvice.length < 3) throw new Error(`Yetersiz tavsiye sayısı (${rawAdvice.length})`);

  // Tasarruf rakamı Gemini'den değil, kodla hesaplanmış kalemlerden; aynı kalem bir kez sayılır.
  const allocation = allocateSavings(rawAdvice.map((a) => a.savingKeys), candidates);
  const advice = rawAdvice.map((a, i) => ({ ...a, annualSaving: allocation.perAdvice[i] }));

  const summary = text(o.summary, 800);
  if (!summary) throw new Error("Özet boş");

  return { merchantFixes, findings, advice, summary, totalAnnualSaving: allocation.total };
}

export async function analyzeWithGemini(txs: Transaction[]): Promise<AnalyzeResponse> {
  const rows = uniqueDescriptions(txs);
  const candidates = savingCandidates(summarize(txs));
  const { data, model } = await generateJson({
    systemInstruction: SYSTEM,
    prompt: buildAnalysisPrompt(txs, rows, candidates),
    schema: buildSchema(candidates.map((c) => c.key)),
    temperature: 0.3,
    maxOutputTokens: 32_768,
    timeoutMs: 120_000,
    parse: (raw) => parseAnalysisOutput(raw, rows, candidates),
  });
  return { ...data, model };
}
