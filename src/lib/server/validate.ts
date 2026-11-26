import "@/lib/server-guard";
import { maskSensitiveData } from "@/lib/privacy-masker";
import { CATEGORIES } from "@/lib/statement/categories";
import type { CategoryId, ChatMessage, Transaction } from "@/lib/statement/types";

/**
 * İstemciden gelen veriyi güvenmeden okur. İşlemler tarayıcıda zaten maskeli
 * durur; yine de Gemini'ye gitmeden önce her metin alanı sunucuda yeniden
 * maskelenir (savunma derinliği: kullanıcı sohbete kart numarasını yazsa bile).
 */

export class BadRequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 3 * 1024 * 1024;
export const MAX_TRANSACTIONS = 3000;

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new BadRequestError("İstek çok büyük.", 413);
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new BadRequestError("Geçersiz JSON gövdesi.");
  }
}

const mask = (s: string) => maskSensitiveData(s).text;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

export function readTransactions(raw: unknown): Transaction[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestError("İşlem listesi boş.");
  if (raw.length > MAX_TRANSACTIONS) throw new BadRequestError(`En fazla ${MAX_TRANSACTIONS} işlem gönderilebilir.`, 413);

  return raw.map((item, i): Transaction => {
    const o = (item ?? {}) as Record<string, unknown>;
    const date = str(o.date, 10);
    const description = str(o.description, 300);
    const amount = typeof o.amount === "number" ? o.amount : NaN;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || !Number.isFinite(amount) || amount < 0 || amount > 1e9) {
      throw new BadRequestError(`${i + 1}. işlem geçersiz.`);
    }
    const category = typeof o.category === "string" && o.category in CATEGORIES ? (o.category as CategoryId) : "diger";
    return {
      id: str(o.id, 120) ?? `t${i}`,
      date,
      description: mask(description),
      merchant: mask(str(o.merchant, 120) || description),
      category,
      amount: Math.round(amount * 100) / 100,
      kind: o.kind === "credit" ? "credit" : "debit",
      isBankFee: o.isBankFee === true,
    };
  });
}

export const MAX_CHAT_HISTORY = 12;
export const MAX_QUESTION_CHARS = 1000;

export function readChatMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestError("Mesaj yok.");
  const messages = raw
    .slice(-MAX_CHAT_HISTORY)
    .map((m): ChatMessage | null => {
      const o = (m ?? {}) as Record<string, unknown>;
      const role = o.role === "assistant" ? "assistant" : o.role === "user" ? "user" : null;
      const text = str(o.text, role === "user" ? MAX_QUESTION_CHARS : 4000)?.trim();
      if (!role || !text || o.error === true) return null;
      return { role, text: mask(text) };
    })
    .filter((m): m is ChatMessage => m !== null);

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") throw new BadRequestError("Son mesaj kullanıcı sorusu olmalı.");
  return messages;
}
