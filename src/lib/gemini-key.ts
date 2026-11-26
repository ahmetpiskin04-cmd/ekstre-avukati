/**
 * Telefon (APK) sürümünde Gemini anahtarı cihazda, uygulamanın kendi depolamasında durur
 * (sunucu yok). Web sürümünde anahtar sunucu ortamındadır ve bu modül kullanılmaz.
 */
export const GEMINI_KEY_STORAGE = "ekstre-avukati:gemini-key:v1";

/** Telefon (sunucusuz) derlemesi mi? Derleme zamanında sabitlenir. */
export const STANDALONE = process.env.NEXT_PUBLIC_STANDALONE === "1";

export function readStoredKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Anahtar biçimini kabaca doğrular (yanlış yapıştırmayı erken yakalar); içeriğini asla loglamaz. */
export function looksLikeGeminiKey(value: string): boolean {
  const v = value.trim();
  return v.length >= 30 && v.length <= 120 && /^[A-Za-z0-9_\-.]+$/.test(v);
}
