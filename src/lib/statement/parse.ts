import Papa from "papaparse";
import { categorize, isBankFee, looksLikeCredit, normalizeTr } from "./categories";
import { cleanMerchant } from "./merchant";
import type { Transaction } from "./types";

/* ------------------------------------------------------------------ */
/* Tutar ve tarih                                                      */
/* ------------------------------------------------------------------ */

/**
 * Türk ve İngiliz biçimli tutarları sayıya çevirir.
 * "1.234,56" -> 1234.56 · "-89,90 TL" -> -89.9 · "1,234.56" -> 1234.56 · "250,00-" -> -250
 */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s+/g, "");
  s = s.replace(/(?:TL|TRY|₺)$/i, "").replace(/^(?:TL|TRY|₺)/i, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (!/^\d[\d.,]*$/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    // İkisi de varsa sonda olan ondalık ayırıcıdır.
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    normalized = /,\d{1,2}$/.test(s) && s.split(",").length === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot !== -1) {
    // "1.234" Türkçede binlik; "12.50" ondalık.
    normalized = /\.\d{1,2}$/.test(s) && s.split(".").length === 2 ? s : s.replace(/\./g, "");
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round((negative ? -n : n) * 100) / 100;
}

const TR_MONTHS: Record<string, number> = {
  OCAK: 1, SUBAT: 2, MART: 3, NISAN: 4, MAYIS: 5, HAZIRAN: 6,
  TEMMUZ: 7, AGUSTOS: 8, EYLUL: 9, EKIM: 10, KASIM: 11, ARALIK: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "15.08.2026", "15/08/26", "2026-08-15", "15 Ağustos 2026" -> "2026-08-15" */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})/);
  if (m) {
    const month = TR_MONTHS[normalizeTr(m[2])];
    if (month) return iso(+m[3], month, +m[1]);
  }
  return null;
}

const DATE_AT_START = /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+(?:Ocak|Şubat|Subat|Mart|Nisan|Mayıs|Mayis|Haziran|Temmuz|Ağustos|Agustos|Eylül|Eylul|Ekim|Kasım|Kasim|Aralık|Aralik)\s+\d{4})/i;

/* ------------------------------------------------------------------ */
/* Ortak: ham satırlardan işlemlere                                    */
/* ------------------------------------------------------------------ */

interface RawRow {
  date: string;
  description: string;
  /** İşaretli tutar (ekstredeki gibi) */
  signed: number;
  /** Borç/Alacak sütunlarından kesin biliniyorsa */
  explicitKind?: "debit" | "credit";
}

function toTransactions(rows: RawRow[]): Transaction[] {
  // İşaret yönü: kredi kartı ekstresinde harcamalar pozitif, banka hesap
  // dökümünde negatif yazılır. Çoğunluğa bakarak karar veriyoruz.
  const implicit = rows.filter((r) => !r.explicitKind && !looksLikeCredit(r.description));
  const negatives = implicit.filter((r) => r.signed < 0).length;
  const positives = implicit.filter((r) => r.signed > 0).length;
  const expenseIsNegative = negatives > positives;

  return rows
    .filter((r) => r.signed !== 0)
    .map((r, i) => {
      let kind: "debit" | "credit";
      if (r.explicitKind) kind = r.explicitKind;
      else if (looksLikeCredit(r.description)) kind = "credit";
      else kind = (r.signed < 0) === expenseIsNegative ? "debit" : "credit";

      const fee = kind === "debit" && isBankFee(r.description);
      return {
        id: `t${i}-${r.date}-${Math.abs(r.signed)}`,
        date: r.date,
        description: r.description,
        merchant: cleanMerchant(r.description),
        category: fee ? "banka" : categorize(r.description),
        amount: Math.abs(r.signed),
        kind,
        isBankFee: fee,
      } satisfies Transaction;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

interface Columns {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
}

function detectHeader(row: string[]): Columns | null {
  const cells = row.map((c) => normalizeTr(c ?? ""));
  const find = (re: RegExp, exclude: number[] = []) =>
    cells.findIndex((c, i) => !exclude.includes(i) && re.test(c));

  const date = find(/TARIH|DATE/);
  if (date === -1) return null;
  const description = find(/ACIKLAMA|ISLEM|ISYERI|DESCRIPTION|DETAY|MERCHANT|AYRINTI/, [date]);
  const amount = find(/TUTAR|AMOUNT|MIKTAR/, [date, description]);
  const debit = find(/^BORC|BORC\b|DEBIT/, [date, description]);
  const credit = find(/ALACAK|CREDIT/, [date, description]);
  if (description === -1 || (amount === -1 && debit === -1)) return null;
  return { date, description, amount, debit, credit };
}

export function parseCsvStatement(text: string): { transactions: Transaction[]; warnings: string[] } {
  const warnings: string[] = [];
  const clean = text.replace(/^﻿/, "");
  const parsed = Papa.parse<string[]>(clean, { skipEmptyLines: true, delimiter: detectDelimiter(clean) });
  const rows = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => c?.trim()));

  let cols: Columns | null = null;
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    cols = detectHeader(rows[i]);
    if (cols) {
      start = i + 1;
      break;
    }
  }

  const raw: RawRow[] = [];
  let skipped = 0;
  for (const row of rows.slice(start)) {
    const r = cols ? fromColumns(row, cols) : inferRow(row);
    if (r) raw.push(r);
    else skipped++;
  }

  if (!cols) warnings.push("Başlık satırı bulunamadı; sütunlar içerikten tahmin edildi.");
  if (raw.length === 0) warnings.push("CSV dosyasında işlem satırı bulunamadı.");
  else if (skipped > 0) warnings.push(`${skipped} satır işlem olarak okunamadı ve atlandı (özet/toplam satırları olabilir).`);

  return { transactions: toTransactions(raw), warnings };
}

/**
 * Türk bankaları çoğunlukla ";" kullanır çünkü "," ondalık ayırıcıdır.
 * Ekstrenin başındaki ayraçsız bilgi satırları Papa'nın otomatik tahminini
 * bozabildiği için ayracı satır sayımıyla kendimiz seçiyoruz.
 */
function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 60);
  const score = (d: string) => lines.filter((l) => l.includes(d)).length;
  if (score("\t") >= lines.length * 0.5) return "\t";
  if (score(";") >= lines.length * 0.5) return ";";
  return ",";
}

function fromColumns(row: string[], c: Columns): RawRow | null {
  const date = parseDate(row[c.date] ?? "");
  const description = (row[c.description] ?? "").trim();
  if (!date || !description) return null;

  if (c.amount !== -1) {
    const signed = parseAmount(row[c.amount] ?? "");
    if (signed === null) return null;
    return { date, description, signed };
  }
  const debit = c.debit !== -1 ? parseAmount(row[c.debit] ?? "") : null;
  const credit = c.credit !== -1 ? parseAmount(row[c.credit] ?? "") : null;
  if (debit) return { date, description, signed: -Math.abs(debit), explicitKind: "debit" };
  if (credit) return { date, description, signed: Math.abs(credit), explicitKind: "credit" };
  return null;
}

function inferRow(row: string[]): RawRow | null {
  const date = row.map((c) => parseDate(c ?? "")).find(Boolean);
  if (!date) return null;
  const amounts = row.map((c) => parseAmount(c ?? "")).filter((n): n is number => n !== null);
  const text = row
    .filter((c) => c && parseAmount(c) === null && !parseDate(c))
    .sort((a, b) => b.length - a.length)[0];
  if (!amounts.length || !text) return null;
  return { date, description: text.trim(), signed: amounts[0] };
}

/* ------------------------------------------------------------------ */
/* PDF (satırlara dönüştürülmüş metin)                                 */
/* ------------------------------------------------------------------ */

// Kuruşlu yazım şart: "SUBE 123" gibi açıklama sonundaki sayılar tutar sanılmasın.
const AMOUNT_TOKEN = /^[-+−]?\(?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\)?-?$|^[-+−]?\d+[.,]\d{2}-?$/;

/**
 * Her satır: "15.08.2026 MIGROS SUBE123 ISTANBUL TR 1.234,56 12,34"
 * Sondaki sayı grubunun İLKİ tutardır (sonrakiler genelde puan/bakiye).
 */
export function parsePdfLines(lines: string[]): { transactions: Transaction[]; warnings: string[] } {
  const warnings: string[] = [];
  const raw: RawRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim().replace(/\s+/g, " ");
    const dm = trimmed.match(DATE_AT_START);
    if (!dm) continue;
    const date = parseDate(dm[1]);
    if (!date) continue;

    let rest = trimmed.slice(dm[0].length).trim();
    rest = rest.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/, ""); // saat
    rest = rest.replace(/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*/, ""); // ikinci tarih (valör)

    const tokens = rest.split(" ").filter((t) => !/^(?:TL|TRY|₺)$/i.test(t));
    let firstTrailing = tokens.length;
    while (firstTrailing > 0 && AMOUNT_TOKEN.test(tokens[firstTrailing - 1])) firstTrailing--;
    if (firstTrailing === tokens.length) continue; // tutar yok

    const description = tokens.slice(0, firstTrailing).join(" ").trim();
    const signed = parseAmount(tokens[firstTrailing]);
    if (!description || signed === null) continue;
    raw.push({ date, description, signed });
  }

  if (raw.length === 0) {
    warnings.push(
      "Metinde tarih + açıklama + tutar biçiminde işlem satırı bulunamadı.",
    );
  }
  return { transactions: toTransactions(raw), warnings };
}
