import "@/lib/server-guard";
import { readStoredKey } from "@/lib/gemini-key";
import {
  GoogleGenerativeAI,
  type Content,
  type GenerationConfig,
  type ModelParams,
  type Part,
  type ResponseSchema,
} from "@google/generative-ai";

/**
 * Sunucu tarafı Gemini istemcisi. GEMINI_API_KEY yalnızca burada okunur;
 * "server-only" sayesinde bu dosya istemci paketine giremez.
 */

export class GeminiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

// gemini-2.5-flash yeni anahtarlarda 404 veriyor. Sıra: ana model, sonra yedekler.
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

export function geminiModels(): string[] {
  const env = process.env.GEMINI_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return env?.length ? env : DEFAULT_MODELS;
}

/**
 * Anahtar kaynağı: sunucuda ortam değişkeni; telefon (APK) sürümünde, sunucu olmadığı için,
 * kullanıcının cihaza girdiği anahtar (yalnızca uygulamanın kendi depolamasında durur).
 */
function currentKey(): string | undefined {
  return typeof window === "undefined" ? process.env.GEMINI_API_KEY?.trim() || undefined : readStoredKey();
}

export function isGeminiConfigured(): boolean {
  return Boolean(currentKey());
}

let client: { key: string; sdk: GoogleGenerativeAI } | null = null;
function getClient(): GoogleGenerativeAI {
  const key = currentKey();
  if (!key) {
    throw new GeminiError(
      typeof window === "undefined"
        ? "Gemini API anahtarı ayarlı değil. .env.local dosyasına GEMINI_API_KEY ekleyip sunucuyu yeniden başlatın."
        : "Gemini anahtarı girilmemiş. Üst bardaki anahtar simgesinden ekleyin.",
      503,
    );
  }
  // Anahtar değişebilir (telefonda kullanıcı yenisini girer): önbellek anahtara bağlı.
  if (client?.key !== key) client = { key, sdk: new GoogleGenerativeAI(key) };
  return client.sdk;
}

interface BaseRequest<T> {
  systemInstruction: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Çıktıyı doğrular; geçersizse Error fırlatmalı (aynı model bir kez daha denenir). */
  parse: (text: string) => T;
}

export interface JsonRequest<T> extends Omit<BaseRequest<T>, "parse"> {
  prompt: string;
  schema: ResponseSchema;
  parse: (raw: unknown) => T;
}

export interface TextRequest<T> extends BaseRequest<T> {
  /** Tek tur: metin + dosya parçaları (ör. PDF inlineData) */
  parts?: Part[];
  /** Çok turlu sohbet geçmişi (role: "user" | "model") */
  contents?: Content[];
}

export interface GeminiResult<T> {
  data: T;
  model: string;
}

/** Structured Output (responseSchema) ile JSON üretir. */
export function generateJson<T>(req: JsonRequest<T>): Promise<GeminiResult<T>> {
  return run({
    timeoutMs: req.timeoutMs,
    params: (model) => ({
      model,
      systemInstruction: req.systemInstruction,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: req.schema,
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: req.maxOutputTokens,
      } satisfies GenerationConfig,
    }),
    contents: [{ role: "user", parts: [{ text: req.prompt }] }],
    parse: (text) => req.parse(JSON.parse(text)),
  });
}

/** Düz metin üretir; PDF/görsel girdi veya çok turlu sohbet alabilir. */
export function generateText<T>(req: TextRequest<T>): Promise<GeminiResult<T>> {
  const contents = req.contents ?? [{ role: "user", parts: req.parts ?? [] }];
  return run({
    timeoutMs: req.timeoutMs,
    params: (model) => ({
      model,
      systemInstruction: req.systemInstruction,
      generationConfig: { temperature: req.temperature ?? 0.2, maxOutputTokens: req.maxOutputTokens },
    }),
    contents,
    parse: req.parse,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusOf = (err: unknown) => (err as { status?: number })?.status;

class InvalidOutputError extends Error {}

/**
 * Model zinciri + yeniden deneme:
 * - 404 (model yok) / 429 (kota) / ağ-zaman aşımı → sıradaki model
 * - 500/503 (aşırı yük) → aynı model kısa beklemeyle bir kez daha, sonra sıradaki
 * - Geçersiz çıktı → aynı model bir kez daha, sonra sıradaki
 * - 400/401/403 (anahtar/istek hatası) → hemen hata
 */
async function run<T>(opts: {
  timeoutMs?: number;
  params: (model: string) => ModelParams;
  contents: Content[];
  parse: (text: string) => T;
}): Promise<GeminiResult<T>> {
  const genAI = getClient();
  let lastError: unknown;

  for (const modelName of geminiModels()) {
    const model = genAI.getGenerativeModel(opts.params(modelName), { timeout: opts.timeoutMs ?? 90_000 });

    for (let attempt = 1; attempt <= 2; attempt++) {
      let text: string;
      try {
        const result = await model.generateContent({ contents: opts.contents });
        text = result.response.text();
      } catch (err) {
        lastError = err;
        const status = statusOf(err);
        console.warn(`[gemini] ${modelName} deneme ${attempt}: HTTP ${status ?? "-"} ${errMessage(err)}`);
        if (status === 400 || status === 401 || status === 403) throw new GeminiError(friendlyMessage(err), 502);
        if (!status || status === 404 || status === 429) break;
        if (attempt < 2) await sleep(1_500);
        continue;
      }

      try {
        return { data: opts.parse(text), model: modelName };
      } catch (err) {
        lastError = new InvalidOutputError(errMessage(err));
        console.warn(`[gemini] ${modelName} deneme ${attempt}: geçersiz çıktı: ${errMessage(err)}`);
      }
    }
  }
  throw new GeminiError(friendlyMessage(lastError), statusOf(lastError) === 429 ? 429 : 502);
}

function errMessage(err: unknown) {
  return err instanceof Error ? err.message.slice(0, 300) : String(err);
}

function friendlyMessage(err: unknown): string {
  if (err instanceof InvalidOutputError) return "Yapay zekâ geçerli bir çıktı üretemedi. Lütfen tekrar deneyin.";
  const status = statusOf(err);
  const msg = errMessage(err);
  if (status === 400 && /API key/i.test(msg)) return "Gemini API anahtarı geçersiz. .env.local'deki GEMINI_API_KEY değerini kontrol edin.";
  if (status === 400) return "Gemini isteği reddetti (dosya çok büyük veya desteklenmiyor olabilir).";
  if (status === 401 || status === 403) return "Gemini API anahtarı reddedildi (yetki yok).";
  if (status === 429) return "Gemini kullanım kotası doldu. Biraz bekleyip tekrar deneyin.";
  if (status === 503 || status === 500) return "Gemini şu an aşırı yoğun. Biraz sonra tekrar deneyin.";
  if (status === 404) return "Ayarlı Gemini modellerinin hiçbiri kullanılamıyor. GEMINI_MODELS ayarını güncelleyin.";
  if (!status) return "Gemini'ye ulaşılamadı ya da yanıt çok uzun sürdü. Tekrar deneyin.";
  return `Gemini hatası (${status}).`;
}
