import "@/lib/server-guard";
import { bytesToBase64 } from "@/lib/base64";
import { generateText } from "./gemini";

/**
 * Taranmış (görsel) PDF ekstreleri Gemini'ye verip işlem satırlarını düz metin
 * olarak yazdırır. Çıktı burada MASKELENMEZ: çağıran (process-statement)
 * dönen metni privacy-masker'dan geçirip öyle ayrıştırır.
 */

const NO_TRANSACTIONS = "ISLEM_YOK";

const SYSTEM = `Sen bir banka ekstresi okuma motorusun. Sana bir kredi kartı veya banka hesap ekstresi PDF'i verilecek (taranmış/fotoğraf olabilir).
Görevin yalnızca İŞLEM SATIRLARINI düz metin olarak aktarmak.

ÇIKTI BİÇİMİ — her işlem TEK satır:
GG.AA.YYYY AÇIKLAMA TUTAR

- Tarih: işlem tarihi, GG.AA.YYYY. Ekstrede yıl yazmıyorsa ekstre döneminden çıkar.
- AÇIKLAMA: ekstrede yazdığı gibi (düzeltme, çeviri, kısaltma açma yapma).
- TUTAR: Türk biçimi, binlik nokta ve iki haneli kuruş virgülle: 1.234,56 · Para birimi yazma.
  Ekstrede eksi, "-", "A"/"Alacak" ya da ödeme/iade olarak görünen tutarların başına "-" koy.
- Puan/bonus/bakiye/taksit tutarı gibi ek sütunları YAZMA; her satırda yalnızca bir tutar olsun.
- Başlık, sayfa no, toplam, dönem borcu, asgari ödeme, son ödeme tarihi satırlarını YAZMA.
- Kart numarası, IBAN ve T.C. kimlik numarasını ASLA yazma; açıklamada geçiyorsa yerine [GİZLİ_VERİ] yaz.
- Hiç işlem satırı yoksa yalnızca ${NO_TRANSACTIONS} yaz.
- Başka hiçbir açıklama, kod bloğu veya yorum ekleme.`;

const DATE_LINE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s+\S/;

export function parseVisionOutput(text: string): string[] {
  const cleaned = text.replace(/```[a-z]*\n?/gi, "").trim();
  if (cleaned === NO_TRANSACTIONS || cleaned.startsWith(NO_TRANSACTIONS)) return [];
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-*•]\s+/, ""))
    .filter((l) => DATE_LINE.test(l));
  if (lines.length === 0) throw new Error("Görsel okuma çıktısında işlem satırı yok");
  return lines;
}

export async function transcribeStatementPdf(bytes: Uint8Array): Promise<{ lines: string[]; model: string }> {
  if (bytes.byteLength === 0) throw new Error("Görsel okuma için PDF verisi boş");
  const { data, model } = await generateText({
    systemInstruction: SYSTEM,
    parts: [
      { inlineData: { mimeType: "application/pdf", data: bytesToBase64(bytes) } },
      { text: "Bu ekstredeki tüm işlem satırlarını belirtilen biçimde yaz." },
    ],
    temperature: 0,
    maxOutputTokens: 32_768,
    timeoutMs: 180_000,
    parse: parseVisionOutput,
  });
  return { lines: data, model };
}
