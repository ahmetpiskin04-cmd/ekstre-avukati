import type { CategoryId } from "@/lib/statement/types";

/**
 * Kategori → sabit seri rengi (renk sıraya değil kategoriye bağlı; görünüm değişse de aynı kalır).
 * Dataviz kuralı: bir çubukta en fazla 8 renk. En sık 7 kategori doğrulanmış paletin
 * 1-7. yuvalarını alır; kalanlar nötr "Diğer kategoriler" grubuna katlanır.
 * Banka kesintisi rozetlerde durum rengiyle (mercan) gösterilir; grafikte "Diğer"e katlanır.
 */
export const CATEGORY_SLOT: Partial<Record<CategoryId, number>> = {
  market: 1,
  restoran: 2,
  ulasim: 3,
  fatura: 4,
  dijital: 5,
  alisveris: 6,
  eglence: 7,
};

/** Yığılmış çubukta segment sırası: doğrulanmış komşuluk sırası (yuva 1→7), en sonda "Diğer". */
export const SERIES_ORDER: CategoryId[] = ["market", "restoran", "ulasim", "fatura", "dijital", "alisveris", "eglence"];

export function categoryColor(category: CategoryId | "other"): string {
  if (category === "banka") return "var(--bad-fill)";
  if (category === "other") return "var(--cat-other)";
  const slot = CATEGORY_SLOT[category];
  return slot ? `var(--cat-${slot})` : "var(--cat-other)";
}

/** Grafikte kendi segmenti olan kategori mi (değilse "Diğer kategoriler"e katlanır) */
export const hasOwnSeries = (category: CategoryId) => category in CATEGORY_SLOT;
