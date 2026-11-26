import { overlapSavingsByGroup, SERVICE_GROUP_LABEL, type StatementSummary } from "./analyze";
import type { AiAdvice, AiAnalysis } from "./types";

/**
 * Tasarruf tekilleştirme. Yıllık tasarruf rakamlarını Gemini'nin yazdığı
 * sayılardan DEĞİL, kodla hesaplanmış aday kalemlerden (banka kesinti türleri,
 * çakışan abonelik grupları) topluyoruz. Her tavsiye hangi kalemlere dayandığını
 * `savingKeys` ile bildirir; aynı kalem yalnızca ilk sayıldığı maddede toplama girer.
 */

export interface SavingCandidate {
  key: string;
  label: string;
  annualAmount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function savingCandidates(s: StatementSummary): SavingCandidate[] {
  const out: SavingCandidate[] = [];
  for (const f of s.fees) {
    if (f.annualized > 0) out.push({ key: `fee:${f.type}`, label: f.label, annualAmount: f.annualized });
  }
  for (const [group, amount] of overlapSavingsByGroup(s.subscriptions)) {
    if (amount > 0) out.push({ key: `overlap:${group}`, label: `Çakışan ${SERVICE_GROUP_LABEL[group].toLocaleLowerCase("tr-TR")} abonelikleri`, annualAmount: amount });
  }
  return out;
}

export interface Allocation {
  /** Her tavsiye için o maddeye özgü (daha önce sayılmamış) tasarruf; hiç yoksa null */
  perAdvice: Array<number | null>;
  total: number;
}

export function allocateSavings(adviceKeys: string[][], candidates: SavingCandidate[]): Allocation {
  const amounts = new Map(candidates.map((c) => [c.key, c.annualAmount]));
  const claimed = new Set<string>();
  let total = 0;
  const perAdvice = adviceKeys.map((keys) => {
    let sum = 0;
    let any = false;
    for (const key of new Set(keys)) {
      const amount = amounts.get(key);
      if (amount === undefined || claimed.has(key)) continue;
      claimed.add(key);
      sum += amount;
      any = true;
    }
    total += sum;
    return any ? round2(sum) : null;
  });
  return { perAdvice, total: round2(total) };
}

/** Eski kayıtlarda totalAnnualSaving yoksa madde değerlerinin toplamına düşer. */
export function adviceTotal(analysis: Pick<AiAnalysis, "advice" | "totalAnnualSaving">): number {
  if (typeof analysis.totalAnnualSaving === "number") return analysis.totalAnnualSaving;
  return round2(analysis.advice.reduce((s: number, a: AiAdvice) => s + (a.annualSaving ?? 0), 0));
}
