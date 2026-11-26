"use client";

import { analyzeWithGemini } from "@/lib/server/ai-analyze";
import { chatWithGemini } from "@/lib/server/ai-chat";
import { GeminiError } from "@/lib/server/gemini";
import { processStatement, StatementError } from "@/lib/server/process-statement";
import { BadRequestError, readChatMessages, readTransactions } from "@/lib/server/validate";
import type { AnalyzeResponse, ChatMessage, ChatResponse, ParsedStatement, Transaction } from "@/lib/statement/types";

/**
 * TELEFON (APK) MOTORU — sunucu yok. API rotalarının çalıştırdığı aynı kod burada, cihazın
 * içinde çalışır; yalnızca Gemini çağrıları internete çıkar ve yalnızca MASKELENMİŞ metin gider.
 * Gizlilik sırası web sürümüyle aynıdır: dosya cihazda okunur → maskelenir → ayrıştırılır;
 * Gemini'ye giden her işlem ve soru yine `validate.ts` ile yeniden maskelenir.
 * Yalnızca derleme zamanında `@engine` takma adı bu dosyaya yönlendiğinde pakete girer.
 */

function friendly(e: unknown, fallback: string): Error {
  if (e instanceof StatementError || e instanceof GeminiError || e instanceof BadRequestError) return new Error(e.message);
  console.error("[ekstre-avukati]", e instanceof Error ? e.message : e);
  return new Error(fallback);
}

export async function uploadStatement(file: File, opts: { demo?: boolean; vision?: boolean } = {}): Promise<ParsedStatement> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const statement = await processStatement(file.name, bytes, { allowVision: Boolean(opts.vision) });
    if (opts.demo) statement.isDemo = true;
    return statement;
  } catch (e) {
    throw friendly(e, "Ekstre işlenirken beklenmeyen bir hata oluştu.");
  }
}

export async function analyzeStatement(transactions: Transaction[]): Promise<AnalyzeResponse> {
  try {
    const txs = readTransactions(transactions);
    if (!txs.some((t) => t.kind === "debit")) throw new BadRequestError("Analiz edilecek harcama yok.");
    return await analyzeWithGemini(txs);
  } catch (e) {
    throw friendly(e, "Analiz sırasında beklenmeyen bir hata oluştu.");
  }
}

export async function askStatement(messages: ChatMessage[], transactions: Transaction[]): Promise<ChatResponse> {
  try {
    const msgs = readChatMessages(messages.filter((m) => !m.error).map(({ role, text }) => ({ role, text })));
    return await chatWithGemini(msgs, readTransactions(transactions));
  } catch (e) {
    throw friendly(e, "Yanıt üretilirken beklenmeyen bir hata oluştu.");
  }
}
