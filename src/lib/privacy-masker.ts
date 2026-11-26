import "@/lib/server-guard";

/**
 * Gizlilik ve hassas veri maskeleme katmanı.
 *
 * Ekstre metni yapay zekâya (Gemini) veya tarayıcıya gönderilmeden ÖNCE sunucuda
 * bu fonksiyondan geçer. Kural sırası önemlidir:
 *   1. IBAN (TR + 24 hane)  -> [GİZLİ_VERİ]
 *   2. Kart numarası (16 hane) -> **** **** **** 1234
 *   3. T.C. Kimlik No (11 hane) -> [GİZLİ_VERİ]
 * IBAN önce ele alınır; yoksa içindeki 16 haneli parça kart numarası sanılırdı.
 *
 * Bilerek "fazla maskeleme" tarafında durur: 16 haneli bir referans numarası da
 * kart gibi maskelenir. Gizlilikte yanlış pozitif, yanlış negatiften iyidir.
 */

import type { MaskReport } from "./statement/types";

export type { MaskReport };

export const SECRET_TOKEN = "[GİZLİ_VERİ]";

export interface MaskResult {
  text: string;
  report: MaskReport;
}

// TR + 24 rakam; aralarda boşluk veya tire olabilir (TR33 0006 1005 ...).
const IBAN_RE = /(?<![A-Za-z0-9])TR(?:[ \-]?\d){24}(?!\d)/gi;

// 16 haneli kart: 4'lü gruplar boşluk/tireyle ayrılmış veya bitişik.
// Bankanın zaten kısmen gizlediği biçimleri de yakalar (5528 79** **** 1234).
const CARD_RE = /(?<![\d*Xx])(?:[\d*Xx•]{4}[ \-]?){3}(\d{4})(?![\d])/g;

// 11 haneli T.C. Kimlik No: ilk hane 0 olamaz; daha uzun bir sayının parçası değil.
const TCKN_RE = /(?<!\d)[1-9]\d{10}(?!\d)/g;

export function maskSensitiveData(input: string): MaskResult {
  const report: MaskReport = { cards: 0, ibans: 0, nationalIds: 0 };

  let text = input.replace(IBAN_RE, () => {
    report.ibans++;
    return SECRET_TOKEN;
  });

  text = text.replace(CARD_RE, (match, last4: string) => {
    // En az bir rakam grubu olmalı; "**** **** **** ****" gibi saf yıldızlar zaten gizli.
    if (!/\d/.test(match.slice(0, -4))) {
      // Önceden maskelenmiş kart: biçimi standartlaştır, sayaca ekleme.
      return `**** **** **** ${last4}`;
    }
    report.cards++;
    return `**** **** **** ${last4}`;
  });

  text = text.replace(TCKN_RE, () => {
    report.nationalIds++;
    return SECRET_TOKEN;
  });

  return { text, report };
}

export function totalMasked(report: MaskReport): number {
  return report.cards + report.ibans + report.nationalIds;
}
