import { normalizeTr } from "./categories";
import { cleanMerchant } from "./merchant";
import type { CategoryId, Transaction } from "./types";

/* ------------------------------------------------------------------ */
/* Abonelikler                                                         */
/* ------------------------------------------------------------------ */

export type ServiceGroup = "video" | "muzik" | "bulut" | "yapay-zeka" | "oyun";

const SERVICE_GROUPS: Array<[ServiceGroup, string, RegExp]> = [
  ["video", "Video yayın", /NETFLIX|DISNEY|PRIME VIDEO|BLUTV|EXXEN|MUBI|TABII|GAIN/],
  ["muzik", "Müzik", /SPOTIFY|YOUTUBE PREMIUM|APPLE MUSIC|DEEZER|FIZY/],
  ["bulut", "Bulut depolama", /ICLOUD|GOOGLE ONE|DROPBOX|ONEDRIVE/],
  ["yapay-zeka", "Yapay zekâ", /CHATGPT|OPENAI|CLAUDE|GEMINI/],
  ["oyun", "Oyun", /XBOX|PLAYSTATION|GAME PASS/],
];

export const SERVICE_GROUP_LABEL: Record<ServiceGroup, string> = Object.fromEntries(
  SERVICE_GROUPS.map(([id, label]) => [id, label]),
) as Record<ServiceGroup, string>;

export interface Subscription {
  merchant: string;
  category: CategoryId;
  /** Son ödenen aylık tutar */
  monthlyAmount: number;
  firstAmount: number;
  annualCost: number;
  occurrences: number;
  months: number;
  firstDate: string;
  lastDate: string;
  confidence: "kesin" | "olasi";
  priceIncrease: number | null;
  serviceGroup: ServiceGroup | null;
  /** Aynı türde başka abonelik var mı */
  overlapsWith: string[];
}

const monthKey = (d: string) => d.slice(0, 7);

const NON_SUBSCRIPTION = new Set<CategoryId>(["market", "restoran", "ulasim", "alisveris", "giyim", "nakit", "saglik"]);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function detectSubscriptions(txs: Transaction[]): Subscription[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.kind !== "debit" || t.isBankFee) continue;
    // Taksitler her ay aynı tutarda gelir ama abonelik değildir.
    if (/TAKSIT|\b\d{1,2}\/\d{1,2}\b/.test(normalizeTr(t.description))) continue;
    // Gruplama anahtarı açıklamadan kodla türetilen SABİT ad: ayrı ekstrelerin ayrı yapay
    // zekâ analizleri aynı markaya farklı ad verse bile (ör. "Disney+" / "Disney setup")
    // aynı abonelik tek grupta kalır ve "yeni abonelik" sanılmaz.
    const key = cleanMerchant(t.description);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const subs: Subscription[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    // Görünen ad: en son işlemdeki (yapay zekâ düzeltmiş olabilir) ad.
    const merchant = sorted[sorted.length - 1].merchant;
    const months = new Set(sorted.map((t) => monthKey(t.date))).size;
    const amounts = sorted.map((t) => t.amount);
    const med = median(amounts);
    const similar = amounts.every((a) => Math.abs(a - med) / med <= 0.25);
    const oncePerMonth = sorted.length <= months + 1;
    const isDigital = sorted[0].category === "dijital";

    // Market, yakıt, kart dolumu gibi düzenli ama abonelik olmayan harcamalar hariç.
    const recurringEligible = !NON_SUBSCRIPTION.has(sorted[0].category);

    let confidence: Subscription["confidence"] | null = null;
    if (months >= 2 && similar && oncePerMonth && recurringEligible) confidence = "kesin";
    else if (isDigital) confidence = "olasi";
    if (!confidence) continue;

    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    const norm = normalizeTr(merchant);
    const group = SERVICE_GROUPS.find(([, , re]) => re.test(norm))?.[0] ?? null;

    subs.push({
      merchant,
      category: last.category,
      monthlyAmount: last.amount,
      firstAmount: first.amount,
      annualCost: round2(last.amount * 12),
      occurrences: sorted.length,
      months,
      firstDate: first.date,
      lastDate: last.date,
      confidence,
      priceIncrease: last.amount > first.amount * 1.01 ? round2(last.amount - first.amount) : null,
      serviceGroup: group,
      overlapsWith: [],
    });
  }

  for (const s of subs) {
    if (!s.serviceGroup) continue;
    s.overlapsWith = subs.filter((o) => o !== s && o.serviceGroup === s.serviceGroup).map((o) => o.merchant);
  }

  return subs.sort((a, b) => b.annualCost - a.annualCost);
}

/** Tür başına: aynı türden birden fazla abonelikte, en pahalısı dışındakilerin yıllık toplamı. */
export function overlapSavingsByGroup(subs: Subscription[]): Map<ServiceGroup, number> {
  const byGroup = new Map<ServiceGroup, number[]>();
  for (const s of subs) {
    if (!s.serviceGroup) continue;
    byGroup.set(s.serviceGroup, [...(byGroup.get(s.serviceGroup) ?? []), s.annualCost]);
  }
  const out = new Map<ServiceGroup, number>();
  for (const [group, costs] of byGroup) {
    if (costs.length < 2) continue;
    out.set(group, round2(costs.reduce((a, b) => a + b, 0) - Math.max(...costs)));
  }
  return out;
}

export function overlapSavings(subs: Subscription[]): number {
  let total = 0;
  for (const v of overlapSavingsByGroup(subs).values()) total += v;
  return round2(total);
}

/* ------------------------------------------------------------------ */
/* Banka kesintileri                                                   */
/* ------------------------------------------------------------------ */

export type FeeType = "vergi" | "aidat" | "faiz" | "nakit-avans" | "hesap" | "transfer" | "sms" | "diger";

interface FeeRule {
  type: FeeType;
  label: string;
  re: RegExp;
  yearly: boolean;
  tip: string;
}

const FEE_RULES: FeeRule[] = [
  { type: "vergi", label: "Vergi (BSMV / KKDF)", re: /BSMV|KKDF/, yearly: false, tip: "Faiz ve nakit avans üzerinden alınır; faizi sıfırladığınızda bu kalem de kalkar." },
  { type: "aidat", label: "Yıllık kart aidatı", re: /YILLIK KART|KART UCRETI|KART AIDATI|UYELIK UCRETI/, yearly: true, tip: "Bankanızdan aidatın iadesini veya aidatsız karta geçişi isteyin; sonuç alamazsanız Tüketici Hakem Heyeti'ne başvurabilirsiniz." },
  { type: "faiz", label: "Faiz (akdi / gecikme)", re: /FAIZ/, yearly: false, tip: "Ekstre borcunun tamamını son ödeme tarihinde ödemek bu kalemi sıfırlar." },
  { type: "nakit-avans", label: "Nakit avans ücreti", re: /NAKIT AVANS/, yearly: false, tip: "Nakit ihtiyacında kredi kartı yerine banka kartıyla ATM kullanmak bu ücreti önler." },
  { type: "hesap", label: "Hesap işletim ücreti", re: /HESAP ISLETIM|HESAP BAKIM/, yearly: false, tip: "Maaş müşterisiyseniz birçok banka bu ücreti almaz; muafiyet talep edin." },
  { type: "transfer", label: "EFT / havale ücreti", re: /EFT|HAVALE|FAST/, yearly: false, tip: "Mobil uygulamadan FAST ile gönderim çoğu bankada ücretsizdir." },
  { type: "sms", label: "SMS bilgilendirme ücreti", re: /SMS/, yearly: false, tip: "SMS bildirimlerini kapatıp mobil uygulama bildirimlerine geçebilirsiniz." },
  { type: "diger", label: "Diğer komisyon / masraf", re: /./, yearly: false, tip: "Bu kesintinin ne olduğunu bankanıza sorun; açıklanamayan masraflar itiraz edilebilir." },
];

export interface FeeGroup {
  type: FeeType;
  label: string;
  tip: string;
  total: number;
  count: number;
  annualized: number;
  transactions: Transaction[];
}

export function detectFees(txs: Transaction[], monthsCovered: number): FeeGroup[] {
  const map = new Map<FeeType, FeeGroup>();
  for (const t of txs) {
    if (!t.isBankFee || t.kind !== "debit") continue;
    const norm = normalizeTr(t.description);
    const rule = FEE_RULES.find((r) => r.re.test(norm))!;
    const g = map.get(rule.type) ?? { type: rule.type, label: rule.label, tip: rule.tip, total: 0, count: 0, annualized: 0, transactions: [] };
    g.total = round2(g.total + t.amount);
    g.count++;
    g.transactions.push(t);
    map.set(rule.type, g);
  }
  const months = Math.max(1, monthsCovered);
  for (const g of map.values()) {
    const rule = FEE_RULES.find((r) => r.type === g.type)!;
    g.annualized = round2(rule.yearly ? g.total : (g.total / months) * 12);
  }
  return [...map.values()].sort((a, b) => b.annualized - a.annualized);
}

/* ------------------------------------------------------------------ */
/* Özet                                                                */
/* ------------------------------------------------------------------ */

export interface CategoryTotal {
  category: CategoryId;
  total: number;
  count: number;
  share: number;
}

export interface StatementSummary {
  totalSpending: number;
  totalCredits: number;
  transactionCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  monthsCovered: number;
  monthlyAverage: number;
  categories: CategoryTotal[];
  subscriptions: Subscription[];
  monthlySubscriptionCost: number;
  fees: FeeGroup[];
  feeTotal: number;
  savings: { total: number; fees: number; overlaps: number };
}

export function summarize(txs: Transaction[]): StatementSummary {
  const debits = txs.filter((t) => t.kind === "debit");
  const credits = txs.filter((t) => t.kind === "credit");
  const totalSpending = round2(debits.reduce((s, t) => s + t.amount, 0));
  const dates = txs.map((t) => t.date).sort();
  const monthsCovered = new Set(txs.map((t) => monthKey(t.date))).size;

  const catMap = new Map<CategoryId, CategoryTotal>();
  for (const t of debits) {
    const c = catMap.get(t.category) ?? { category: t.category, total: 0, count: 0, share: 0 };
    c.total = round2(c.total + t.amount);
    c.count++;
    catMap.set(t.category, c);
  }
  const categories = [...catMap.values()]
    .map((c) => ({ ...c, share: totalSpending ? c.total / totalSpending : 0 }))
    .sort((a, b) => b.total - a.total);

  const subscriptions = detectSubscriptions(txs);
  const fees = detectFees(txs, monthsCovered);
  const feeAnnual = round2(fees.reduce((s, f) => s + f.annualized, 0));
  const overlaps = overlapSavings(subscriptions);

  return {
    totalSpending,
    totalCredits: round2(credits.reduce((s, t) => s + t.amount, 0)),
    transactionCount: txs.length,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    monthsCovered,
    monthlyAverage: monthsCovered ? round2(totalSpending / monthsCovered) : 0,
    categories,
    subscriptions,
    monthlySubscriptionCost: round2(subscriptions.reduce((s, x) => s + x.monthlyAmount, 0)),
    fees,
    feeTotal: round2(fees.reduce((s, f) => s + f.total, 0)),
    savings: { total: round2(feeAnnual + overlaps), fees: feeAnnual, overlaps },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
