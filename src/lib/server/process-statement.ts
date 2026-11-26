import "@/lib/server-guard";
import { maskSensitiveData } from "@/lib/privacy-masker";
import { parseCsvStatement, parsePdfLines } from "@/lib/statement/parse";
import type { ParsedStatement } from "@/lib/statement/types";
import { GeminiError, isGeminiConfigured } from "./gemini";
import { extractPdfLines } from "./pdf-text";
import { transcribeStatementPdf } from "./pdf-vision";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PREVIEW_LINES = 40;

export class StatementError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function detectFileType(name: string, bytes: Uint8Array): "pdf" | "csv" | null {
  const isPdfMagic = bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  if (isPdfMagic) return "pdf";
  if (/\.(csv|txt)$/i.test(name)) return "csv";
  return null;
}

/** Windows-1254 (Türkçe) ile kaydedilmiş CSV'leri de okuyabilmek için. */
function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("windows-1254").decode(bytes);
  } catch {
    return utf8;
  }
}

/** PDF'ten bu kadardan az karakter çıkıyorsa taranmış (görsel) belge sayılır. */
const MIN_TEXT_CHARS = 200;

export interface ProcessOptions {
  /** Kullanıcı onay verdiyse taranmış PDF'i Gemini ile okur. */
  allowVision?: boolean;
}

/**
 * Ekstre işleme hattı. Sıra bilinçli:
 *   ham metin -> MASKELE -> ayrıştır
 * Böylece önizleme satırları, işlem açıklamaları ve Gemini'ye giden her şey
 * zaten maskelenmiş metinden türetilir. Taranmış PDF'te ham metni Gemini
 * Vision çıkarır; o metin de aynı maskeleme filtresinden geçer.
 */
export async function processStatement(fileName: string, bytes: Uint8Array, options: ProcessOptions = {}): Promise<ParsedStatement> {
  if (bytes.byteLength === 0) throw new StatementError("Dosya boş.");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new StatementError("Dosya 10 MB sınırını aşıyor.", 413);

  const fileType = detectFileType(fileName, bytes);
  if (!fileType) throw new StatementError("Yalnızca PDF veya CSV ekstre yükleyebilirsiniz.", 415);

  let rawLines: string[];
  if (fileType === "pdf") {
    try {
      // pdf.js tamponu kendine aktarıp boşaltır (detach); görsel okuma için
      // orijinal bayt dizisi sağlam kalsın diye kopya veriyoruz.
      rawLines = (await extractPdfLines(bytes.slice())).lines;
    } catch {
      throw new StatementError("PDF okunamadı. Dosya şifreli veya bozuk olabilir.", 422);
    }
  } else {
    rawLines = decodeText(bytes).replace(/^﻿/, "").split(/\r?\n/);
  }

  const { text: maskedText, report } = maskSensitiveData(rawLines.join("\n"));
  const maskedLines = maskedText.split("\n");

  const { transactions, warnings } =
    fileType === "pdf" ? parsePdfLines(maskedLines) : parseCsvStatement(maskedText);

  const nonEmpty = maskedLines.filter((l) => l.trim());
  const base: ParsedStatement = {
    fileName,
    fileType,
    uploadedAt: new Date().toISOString(),
    previewLines: nonEmpty.slice(0, PREVIEW_LINES),
    totalLines: nonEmpty.length,
    maskReport: report,
    transactions,
    warnings,
    source: "text",
  };

  const textChars = nonEmpty.join("").replace(/\s/g, "").length;
  const unreadablePdf = fileType === "pdf" && (transactions.length === 0 || textChars < MIN_TEXT_CHARS);
  if (!unreadablePdf) return base;

  const reason =
    textChars < MIN_TEXT_CHARS
      ? "PDF'te seçilebilir metin yok; taranmış (görsel) bir ekstre gibi görünüyor."
      : "PDF'teki metinden işlem satırı ayrıştırılamadı.";

  if (!isGeminiConfigured()) {
    return { ...base, warnings: [reason, "Görsel okuma için Gemini anahtarı ayarlı değil (GEMINI_API_KEY)."] };
  }
  if (!options.allowVision) {
    // Kullanıcı onayı olmadan görüntü Gemini'ye gönderilmez.
    return { ...base, needsVision: true, warnings: [reason] };
  }
  return readWithVision(base, bytes, reason);
}

async function readWithVision(base: ParsedStatement, bytes: Uint8Array, reason: string): Promise<ParsedStatement> {
  let lines: string[];
  let model: string;
  try {
    ({ lines, model } = await transcribeStatementPdf(bytes));
  } catch (err) {
    if (err instanceof GeminiError) throw new StatementError(err.message, err.status);
    throw err;
  }

  // Gemini'nin çıkardığı ham metin de önce maskelenir, sonra ayrıştırılır.
  const { text, report } = maskSensitiveData(lines.join("\n"));
  const masked = text.split("\n");
  const { transactions, warnings } = parsePdfLines(masked);

  return {
    ...base,
    previewLines: masked.slice(0, PREVIEW_LINES),
    totalLines: masked.length,
    maskReport: {
      cards: base.maskReport.cards + report.cards,
      ibans: base.maskReport.ibans + report.ibans,
      nationalIds: base.maskReport.nationalIds + report.nationalIds,
    },
    transactions,
    warnings: transactions.length
      ? [`${reason} İşlem satırları yapay zekâ ile görüntüden okundu; tutarları ekstreyle karşılaştırmanız önerilir.`]
      : ["Yapay zekâ bu PDF'te işlem satırı bulamadı.", ...warnings],
    source: "vision",
    visionModel: model,
  };
}
