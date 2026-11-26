import type { AiAnalysis, ParsedStatement, Transaction } from "./types";

/**
 * Çoklu ekstre kütüphanesi: ekleme/silme/birleştirme mantığı (saf fonksiyonlar).
 * Tarayıcı depolaması src/lib/client/stores.ts içinde.
 */

export const ALL = "all" as const;

let counter = 0;
export function newId(): string {
  counter++;
  return `s${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Aynı dosya adı yeniden yüklenirse eskisinin yerine geçer; yeni kayıt sona eklenir. */
export function addStatement(lib: ParsedStatement[], s: ParsedStatement): { lib: ParsedStatement[]; id: string } {
  const id = s.id ?? newId();
  const kept = lib.filter((x) => x.fileName !== s.fileName);
  return { lib: [...kept, { ...s, id }], id };
}

export function removeStatement(lib: ParsedStatement[], id: string): ParsedStatement[] {
  return lib.filter((s) => s.id !== id);
}

/**
 * Birleştirme: iki ekstre aynı dönemi (örtüşen tarihleri) içeriyorsa işlemler
 * ikiye katlanmasın diye, aynı (tarih, açıklama, tutar, yön) anahtarlı işlemlerin
 * adedi için en fazla tek ekstredeki adet alınır. Aynı gün iki özdeş işlem
 * (ör. iki SMS ücreti) tek ekstrede varsa ikisi de korunur.
 */
export function mergeTransactions(statements: ParsedStatement[]): Transaction[] {
  const key = (t: Transaction) => `${t.date}|${t.description}|${t.amount}|${t.kind}`;
  const best = new Map<string, Transaction[]>();
  for (const st of statements) {
    const local = new Map<string, Transaction[]>();
    for (const t of st.transactions) {
      const list = local.get(key(t)) ?? [];
      list.push(t);
      local.set(key(t), list);
    }
    for (const [k, list] of local) {
      if (list.length > (best.get(k)?.length ?? 0)) best.set(k, list);
    }
  }
  return [...best.values()].flat().sort((a, b) => b.date.localeCompare(a.date));
}

export interface Scope {
  /** Analiz/sohbet önbellek anahtarı */
  key: string;
  combined: boolean;
  statements: ParsedStatement[];
  transactions: Transaction[];
}

/** Aktif görünüm: "all" (≥2 ekstre varsa birleşik) ya da tek ekstre; geçersizse en son ekstre. */
export function resolveScope(lib: ParsedStatement[], activeId: string | null): Scope | null {
  if (lib.length === 0) return null;
  if (activeId === ALL && lib.length >= 2) {
    const ids = lib.map((s) => s.id ?? "").sort();
    return { key: `all:${ids.join("|")}`, combined: true, statements: lib, transactions: mergeTransactions(lib) };
  }
  const one = lib.find((s) => s.id === activeId) ?? lib[lib.length - 1];
  return { key: one.id ?? one.uploadedAt, combined: false, statements: [one], transactions: one.transactions };
}

/** Silinen ekstreye bağlı analizleri (tek veya birleşik anahtar) temizler. */
export function pruneAnalyses(analyses: Record<string, AiAnalysis>, lib: ParsedStatement[]): Record<string, AiAnalysis> {
  const ids = new Set(lib.map((s) => s.id));
  const out: Record<string, AiAnalysis> = {};
  for (const [key, a] of Object.entries(analyses)) {
    const parts = key.startsWith("all:") ? key.slice(4).split("|") : [key];
    if (parts.every((p) => ids.has(p))) out[key] = a;
  }
  return out;
}

/** v1 (tek ekstre) kaydını kütüphane biçimine taşır. */
export function migrateLegacy(old: ParsedStatement): { statement: ParsedStatement; analysis: AiAnalysis | null } {
  const id = old.id ?? newId();
  const { analysis, ...rest } = old;
  return { statement: { ...rest, id }, analysis: analysis ?? null };
}

export function statementLabel(s: ParsedStatement): string {
  return s.fileName.replace(/\.(pdf|csv)$/i, "");
}
