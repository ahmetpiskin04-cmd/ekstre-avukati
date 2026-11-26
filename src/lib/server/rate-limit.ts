import "@/lib/server-guard";

/**
 * Basit bellek içi hız sınırı (tek süreçlik yerel uygulama için yeterli).
 * Ücretsiz Gemini kotasının bir döngü/hata yüzünden boşa harcanmasını önler.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterSec: 0 };
}
