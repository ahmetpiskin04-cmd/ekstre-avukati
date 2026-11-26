import { categorize, isBankFee } from "./categories";
import { knownMerchant } from "./merchant";
import type { MerchantFix, Transaction } from "./types";

/**
 * Gemini'nin işyeri adı/kategori düzeltmelerini işlemlere uygular.
 *
 * Yapay zekâ yalnızca ad ve kategoriyi değiştirebilir: tutar, tarih ve
 * harcama/ödeme yönü kodda kalır. Kural tabanlı banka kesintisi tespiti
 * önceliklidir (aidat/BSMV gibi kalemler yapay zekâ ne derse desin kesinti sayılır).
 */
export function applyMerchantFixes(txs: Transaction[], fixes: MerchantFix[]): { transactions: Transaction[]; changed: number } {
  const byDescription = new Map(fixes.map((f) => [f.description, f]));
  let changed = 0;

  const transactions = txs.map((t) => {
    const fix = byDescription.get(t.description);
    if (!fix || t.kind !== "debit") return t;

    const ruleFee = isBankFee(t.description);
    // Kural sözlüğünde net eşleşme (ör. TEKNOSA → Alışveriş) yüksek isabetlidir ve
    // korunur; yapay zekâ kategoriyi yalnızca kuralların tanımadığı açıklamalarda belirler.
    const ruleCategory = categorize(t.description);
    const category = ruleFee ? "banka" : ruleCategory !== "diger" ? ruleCategory : fix.category;
    // Bilinen markalarda ad da kuraldan gelir: yapay zekâ yalnızca tanımadığımız işyerlerini adlandırır.
    const merchant = knownMerchant(t.description) ?? (fix.merchant.trim() || t.merchant);
    const fee = ruleFee || category === "banka";

    if (merchant === t.merchant && category === t.category && fee === t.isBankFee) return t;
    changed++;
    return { ...t, merchant, category, isBankFee: fee, aiEnriched: true };
  });

  return { transactions, changed };
}
