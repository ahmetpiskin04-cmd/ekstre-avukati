"use client";

import type { AnalyzeResponse, ChatMessage, ChatResponse, ParsedStatement, Transaction } from "@/lib/statement/types";

/** Tüm yapay zekâ çağrıları kendi API rotalarımızdan geçer; istemcide anahtar yoktur. */

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.");
  }
  const data = await res.json().catch(() => ({ error: "Sunucudan geçersiz yanıt geldi." }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `İstek başarısız (${res.status}).`);
  return data as T;
}

export function uploadStatement(file: File, opts: { demo?: boolean; vision?: boolean } = {}): Promise<ParsedStatement> {
  const fd = new FormData();
  fd.append("file", file);
  if (opts.demo) fd.append("demo", "1");
  if (opts.vision) fd.append("vision", "1");
  return request("/api/parse-statement", { method: "POST", body: fd });
}

/** Sunucuya yalnızca gereken alanlar gider (maskelenmiş açıklama, ad, kategori, tutar, tarih). */
const slim = (txs: Transaction[]) =>
  txs.map(({ id, date, description, merchant, category, amount, kind, isBankFee }) => ({ id, date, description, merchant, category, amount, kind, isBankFee }));

export function analyzeStatement(transactions: Transaction[]): Promise<AnalyzeResponse> {
  return request("/api/analyze-statement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions: slim(transactions) }),
  });
}

export function askStatement(messages: ChatMessage[], transactions: Transaction[]): Promise<ChatResponse> {
  return request("/api/chat-statement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.filter((m) => !m.error).map(({ role, text }) => ({ role, text })),
      transactions: slim(transactions),
    }),
  });
}
