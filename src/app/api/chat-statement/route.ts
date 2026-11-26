import { chatWithGemini } from "@/lib/server/ai-chat";
import { GeminiError } from "@/lib/server/gemini";
import { rateLimit } from "@/lib/server/rate-limit";
import { BadRequestError, readChatMessages, readJsonBody, readTransactions } from "@/lib/server/validate";

/**
 * POST /api/chat-statement
 * Gövde: { messages: ChatMessage[], transactions: Transaction[] }
 * Anahtar yalnızca sunucuda; istemci Gemini'ye doğrudan hiç bağlanmaz.
 * Kullanıcının yazdığı soru da Gemini'ye gitmeden önce maskelenir.
 */
export async function POST(request: Request) {
  const limit = rateLimit("chat", 15, 60_000);
  if (!limit.ok) {
    return Response.json({ error: `Çok hızlı soru soruyorsunuz. ${limit.retryAfterSec} sn sonra tekrar deneyin.` }, { status: 429 });
  }

  try {
    const body = await readJsonBody(request);
    const messages = readChatMessages(body.messages);
    const transactions = readTransactions(body.transactions);
    const result = await chatWithGemini(messages, transactions);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BadRequestError || err instanceof GeminiError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[chat-statement]", err instanceof Error ? err.message : err);
    return Response.json({ error: "Yanıt üretilirken beklenmeyen bir hata oluştu." }, { status: 500 });
  }
}
