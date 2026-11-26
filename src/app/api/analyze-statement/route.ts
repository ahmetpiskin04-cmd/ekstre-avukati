import { analyzeWithGemini } from "@/lib/server/ai-analyze";
import { GeminiError } from "@/lib/server/gemini";
import { rateLimit } from "@/lib/server/rate-limit";
import { BadRequestError, readJsonBody, readTransactions } from "@/lib/server/validate";

/**
 * POST /api/analyze-statement
 * Gövde: { transactions: Transaction[] } (tarayıcıdaki maskelenmiş işlemler)
 * Yanıt: AnalyzeResponse — işyeri düzeltmeleri, bulgular, 3-5 tavsiye.
 */
export async function POST(request: Request) {
  const limit = rateLimit("analyze", 6, 60_000);
  if (!limit.ok) {
    return Response.json({ error: `Çok sık analiz isteği. ${limit.retryAfterSec} sn sonra tekrar deneyin.` }, { status: 429 });
  }

  try {
    const body = await readJsonBody(request);
    const transactions = readTransactions(body.transactions);
    if (!transactions.some((t) => t.kind === "debit")) {
      return Response.json({ error: "Analiz edilecek harcama yok." }, { status: 400 });
    }
    const result = await analyzeWithGemini(transactions);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "analyze-statement");
  }
}

function errorResponse(err: unknown, tag: string) {
  if (err instanceof BadRequestError || err instanceof GeminiError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(`[${tag}]`, err instanceof Error ? err.message : err);
  return Response.json({ error: "Analiz sırasında beklenmeyen bir hata oluştu." }, { status: 500 });
}
