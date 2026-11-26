import { processStatement, StatementError } from "@/lib/server/process-statement";
import { rateLimit } from "@/lib/server/rate-limit";

/**
 * POST /api/parse-statement
 * multipart/form-data: "file" (.pdf veya .csv), isteğe bağlı "vision=1"
 * (taranmış PDF'i Gemini ile okumaya kullanıcı onay verdi).
 *
 * Dosya diske yazılmaz ve saklanmaz: bellekte okunur, maskelenir, ayrıştırılır
 * ve yalnızca maskelenmiş sonuç tarayıcıya döner.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Geçersiz istek: dosya bekleniyordu." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "\"file\" alanında bir dosya gönderin." }, { status: 400 });
  }

  const allowVision = form.get("vision") === "1";
  if (allowVision) {
    const limit = rateLimit("vision", 6, 60_000);
    if (!limit.ok) {
      return Response.json({ error: `Çok sık görsel okuma isteği. ${limit.retryAfterSec} sn sonra tekrar deneyin.` }, { status: 429 });
    }
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const statement = await processStatement(file.name, bytes, { allowVision });
    if (form.get("demo") === "1") statement.isDemo = true;
    return Response.json(statement, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof StatementError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[parse-statement]", err instanceof Error ? err.message : err);
    return Response.json({ error: "Ekstre işlenirken beklenmeyen bir hata oluştu." }, { status: 500 });
  }
}
