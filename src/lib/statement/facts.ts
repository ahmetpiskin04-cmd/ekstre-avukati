import { formatDate, formatTL } from "@/lib/format";
import { CATEGORIES } from "./categories";
import type { StatementSummary } from "./analyze";
import type { CategoryId, Transaction } from "./types";

/**
 * Yapay zekâya verilecek "kesin rakamlar". Toplama/ortalama gibi hesapları
 * modele bırakmıyoruz: kodla hesaplayıp hazır veriyoruz ki rakam uydurmasın.
 */

const DAY_NAMES = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const round2 = (n: number) => Math.round(n * 100) / 100;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const weekdayName = (iso: string) => DAY_NAMES[utc(iso).getUTCDay()];

export interface WeekdayStats {
  days: Array<{ day: string; count: number; total: number; calendarDays: number; perDay: number }>;
  weekday: { total: number; count: number; calendarDays: number; perDay: number };
  weekend: { total: number; count: number; calendarDays: number; perDay: number };
  /** Hafta sonu günlük ortalamasının hafta içine göre farkı (%); hesaplanamazsa null */
  weekendVsWeekdayPerDayPct: number | null;
  /** Hafta sonu toplamının hafta içi toplamına göre farkı (%) */
  weekendVsWeekdayTotalPct: number | null;
}

/** Dönemdeki her takvim gününü sayar: "hafta sonu günde ortalama" doğru hesaplansın. */
export function weekdayStats(txs: Transaction[]): WeekdayStats {
  const debits = txs.filter((t) => t.kind === "debit");
  const dates = txs.map((t) => t.date).sort();
  const calendar = new Array(7).fill(0) as number[];
  if (dates.length) {
    for (let d = utc(dates[0]); d <= utc(dates[dates.length - 1]); d.setUTCDate(d.getUTCDate() + 1)) {
      calendar[d.getUTCDay()]++;
    }
  }
  const totals = new Array(7).fill(0) as number[];
  const counts = new Array(7).fill(0) as number[];
  for (const t of debits) {
    const i = utc(t.date).getUTCDay();
    totals[i] += t.amount;
    counts[i]++;
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  const days = order.map((i) => ({
    day: DAY_NAMES[i],
    count: counts[i],
    total: round2(totals[i]),
    calendarDays: calendar[i],
    perDay: calendar[i] ? round2(totals[i] / calendar[i]) : 0,
  }));
  const group = (idx: number[]) => {
    const total = round2(idx.reduce((s, i) => s + totals[i], 0));
    const calendarDays = idx.reduce((s, i) => s + calendar[i], 0);
    return { total, count: idx.reduce((s, i) => s + counts[i], 0), calendarDays, perDay: calendarDays ? round2(total / calendarDays) : 0 };
  };
  const weekday = group([1, 2, 3, 4, 5]);
  const weekend = group([0, 6]);
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  return {
    days,
    weekday,
    weekend,
    weekendVsWeekdayPerDayPct: pct(weekend.perDay, weekday.perDay),
    weekendVsWeekdayTotalPct: pct(weekend.total, weekday.total),
  };
}

export function dailyTotals(txs: Transaction[]): Array<{ date: string; total: number; count: number; top: string }> {
  const map = new Map<string, { total: number; count: number; byMerchant: Map<string, number> }>();
  for (const t of txs) {
    if (t.kind !== "debit") continue;
    const d = map.get(t.date) ?? { total: 0, count: 0, byMerchant: new Map() };
    d.total += t.amount;
    d.count++;
    d.byMerchant.set(t.merchant, (d.byMerchant.get(t.merchant) ?? 0) + t.amount);
    map.set(t.date, d);
  }
  return [...map.entries()].map(([date, d]) => ({
    date,
    total: round2(d.total),
    count: d.count,
    top: [...d.byMerchant.entries()].sort((a, b) => b[1] - a[1])[0][0],
  }));
}

export interface MonthTotals {
  month: string;
  total: number;
  byCategory: Partial<Record<CategoryId, number>>;
}

export function monthlyTotals(txs: Transaction[]): MonthTotals[] {
  const map = new Map<string, MonthTotals>();
  for (const t of txs) {
    if (t.kind !== "debit") continue;
    const month = t.date.slice(0, 7);
    const m = map.get(month) ?? { month, total: 0, byCategory: {} };
    m.total = round2(m.total + t.amount);
    m.byCategory[t.category] = round2((m.byCategory[t.category] ?? 0) + t.amount);
    map.set(month, m);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface CategorySpike {
  category: CategoryId;
  month: string;
  previous: number;
  current: number;
  changePct: number;
}

/** Bir önceki aya göre belirgin artan kategoriler (≥%30 ve ≥300 ₺ fark). */
export function categorySpikes(txs: Transaction[], minPct = 30, minDiff = 300): CategorySpike[] {
  const months = monthlyTotals(txs);
  const spikes: CategorySpike[] = [];
  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1];
    const cur = months[i];
    for (const [cat, current] of Object.entries(cur.byCategory) as Array<[CategoryId, number]>) {
      const previous = prev.byCategory[cat] ?? 0;
      const diff = current - previous;
      if (diff < minDiff) continue;
      const changePct = previous > 0 ? Math.round((diff / previous) * 100) : 100;
      if (previous > 0 && changePct < minPct) continue;
      spikes.push({ category: cat, month: cur.month, previous, current, changePct });
    }
  }
  return spikes.sort((a, b) => b.current - b.previous - (a.current - a.previous));
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"][+m - 1]} ${y}`;
};

/** Özet + hesaplanmış tablolar: hem analiz hem sohbet için ortak metin. */
export function buildFactsText(txs: Transaction[], s: StatementSummary): string {
  const lines: string[] = [];
  const credits = txs.filter((t) => t.kind === "credit");
  lines.push("## Genel");
  lines.push(`Dönem: ${s.periodStart ? formatDate(s.periodStart) : "?"} – ${s.periodEnd ? formatDate(s.periodEnd) : "?"} (${s.monthsCovered} ay)`);
  lines.push(`İşlem sayısı: ${txs.length} (harcama ${txs.length - credits.length}, ödeme/iade ${credits.length})`);
  lines.push(`Toplam harcama: ${formatTL(s.totalSpending)} · aylık ortalama ${formatTL(s.monthlyAverage)}`);
  lines.push(`Toplam ödeme/iade (harcamaya dahil değil): ${formatTL(s.totalCredits)}`);

  lines.push("", "## Kategori toplamları (tüm dönem)");
  for (const c of s.categories) {
    lines.push(`- ${CATEGORIES[c.category].label}: ${formatTL(c.total)} (%${Math.round(c.share * 100)}, ${c.count} işlem)`);
  }

  const months = monthlyTotals(txs);
  if (months.length) {
    lines.push("", "## Aylık toplamlar");
    for (const m of months) {
      const cats = (Object.entries(m.byCategory) as Array<[CategoryId, number]>)
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `${CATEGORIES[c].label} ${formatTL(v)}`)
        .join(", ");
      lines.push(`- ${monthLabel(m.month)}: ${formatTL(m.total)} — ${cats}`);
    }
  }

  const spikes = categorySpikes(txs);
  if (spikes.length) {
    lines.push("", "## Önceki aya göre belirgin artışlar");
    for (const sp of spikes.slice(0, 8)) {
      lines.push(`- ${monthLabel(sp.month)} ${CATEGORIES[sp.category].label}: ${formatTL(sp.previous)} → ${formatTL(sp.current)} (${sp.previous > 0 ? `+%${sp.changePct}` : "önceki ay yok"})`);
    }
  }

  const w = weekdayStats(txs);
  lines.push("", "## Haftanın günlerine göre harcama");
  for (const d of w.days) {
    lines.push(`- ${d.day}: ${formatTL(d.total)} (${d.count} işlem, dönemde ${d.calendarDays} gün, günlük ort. ${formatTL(d.perDay)})`);
  }
  lines.push(`Hafta içi: toplam ${formatTL(w.weekday.total)}, ${w.weekday.calendarDays} gün, günlük ort. ${formatTL(w.weekday.perDay)}`);
  lines.push(`Hafta sonu: toplam ${formatTL(w.weekend.total)}, ${w.weekend.calendarDays} gün, günlük ort. ${formatTL(w.weekend.perDay)}`);
  const signedPct = (n: number) => `${n >= 0 ? "+" : "-"}%${Math.abs(n).toLocaleString("tr-TR")}`;
  if (w.weekendVsWeekdayPerDayPct !== null) {
    lines.push(`Hafta sonu GÜNLÜK ortalaması hafta içine göre: ${signedPct(w.weekendVsWeekdayPerDayPct)}`);
  }
  if (w.weekendVsWeekdayTotalPct !== null) {
    lines.push(`Hafta sonu TOPLAMI hafta içi toplamına göre: ${signedPct(w.weekendVsWeekdayTotalPct)}`);
  }

  const days = dailyTotals(txs).sort((a, b) => b.total - a.total).slice(0, 7);
  if (days.length) {
    lines.push("", "## En çok harcama yapılan günler");
    for (const d of days) lines.push(`- ${formatDate(d.date)} (${weekdayName(d.date)}): ${formatTL(d.total)}, ${d.count} işlem, en büyük: ${d.top}`);
  }

  lines.push("", "## Tekrarlayan ödemeler / abonelikler (kodla tespit)");
  if (!s.subscriptions.length) lines.push("- Yok");
  for (const sub of s.subscriptions) {
    const extra = [
      sub.priceIncrease ? `zam: ${formatTL(sub.firstAmount)} → ${formatTL(sub.monthlyAmount)}` : "",
      sub.overlapsWith.length ? `aynı türde: ${sub.overlapsWith.join(", ")}` : "",
      sub.confidence === "olasi" ? "tek ödeme görüldü (olası abonelik)" : "",
    ].filter(Boolean);
    lines.push(`- ${sub.merchant} [${CATEGORIES[sub.category].label}]: aylık ${formatTL(sub.monthlyAmount)}, yıllık ${formatTL(sub.annualCost)}, ${sub.months} ayda ${sub.occurrences} ödeme${extra.length ? ` (${extra.join("; ")})` : ""}`);
  }
  lines.push(`Abonelik toplamı (yukarıdaki TÜM kalemler): aylık ${formatTL(s.monthlySubscriptionCost)}, yıllık ${formatTL(s.monthlySubscriptionCost * 12)}`);
  const byMonthly = [...s.subscriptions].sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  if (byMonthly.length) {
    lines.push(`Aylık tutara göre en pahalıdan ucuza: ${byMonthly.map((x) => `${x.merchant} ${formatTL(x.monthlyAmount)}`).join(" > ")}`);
  }

  lines.push("", "## Banka kesintileri (kodla tespit)");
  if (!s.fees.length) lines.push("- Yok");
  for (const f of s.fees) {
    lines.push(`- ${f.label}: dönemde ${formatTL(f.total)} (${f.count} kez; ${f.transactions.map((t) => formatDate(t.date)).join(", ")}), yıllık karşılığı ≈ ${formatTL(f.annualized)}`);
  }
  lines.push(`Kesinti toplamı (dönem): ${formatTL(s.feeTotal)} · tahmini tasarruf potansiyeli: yıllık ${formatTL(s.savings.total)} (kesinti ${formatTL(s.savings.fees)} + çakışan abonelik ${formatTL(s.savings.overlaps)})`);

  return lines.join("\n");
}

/** Sohbet için tüm işlemler (maskelenmiş) — tarih;gün;işyeri;kategori;tutar;tür */
export function transactionsTable(txs: Transaction[]): string {
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, weekdayName(t.date), t.merchant, CATEGORIES[t.category].label, t.amount.toFixed(2), t.kind === "debit" ? "harcama" : "ödeme/iade", t.description].join(";"));
  return ["tarih;gün;işyeri;kategori;tutar_TL;tür;ham_açıklama", ...rows].join("\n");
}
