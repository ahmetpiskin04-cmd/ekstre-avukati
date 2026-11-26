"use client";

import { Check, KeyRound, Settings, Trash, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { resetAnalysisErrors } from "@/lib/client/analysis-store";
import { useUpdateState } from "@/lib/client/updater";
import { GEMINI_KEY_STORAGE, looksLikeGeminiKey, readStoredKey, STANDALONE } from "@/lib/gemini-key";
import { UpdateSection } from "./app-update";
import { cn } from "./ui";

/* Anahtar yalnızca bu cihazın depolamasında durur; bu küçük depo değişikliği bileşenlere duyurur. */
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === GEMINI_KEY_STORAGE && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
};
const notify = () => listeners.forEach((l) => l());

/** Telefon sürümünde anahtar var mı? Web sürümünde (anahtar sunucuda) her zaman true. */
export function useHasGeminiKey(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !STANDALONE || Boolean(readStoredKey()),
    () => true,
  );
}

function saveKey(key: string) {
  try {
    window.localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
  } catch {
    /* depolama kapalıysa anahtar kaydedilemez */
  }
  resetAnalysisErrors(); // yeni anahtarla bekleyen analizler yeniden denenebilsin
  notify();
}

function removeKey() {
  try {
    window.localStorage.removeItem(GEMINI_KEY_STORAGE);
  } catch {
    /* yok say */
  }
  notify();
}

/** Anahtar giriş formu. Anahtar ekranda gösterilmez (password), loglanmaz, yalnızca cihazda saklanır. */
export function GeminiKeyForm({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const has = Boolean(readStoredKey());

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!looksLikeGeminiKey(value)) {
      setError("Bu bir Gemini anahtarına benzemiyor. Google AI Studio'dan kopyaladığınız anahtarı eksiksiz yapıştırın.");
      return;
    }
    setError(null);
    saveKey(value);
    setValue("");
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block">
        <span className={cn("text-xs font-semibold text-ink-2", compact && "sr-only")}>Gemini API anahtarı</span>
        <input
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={has ? "Yeni anahtar yapıştır (mevcut değişir)" : "Anahtarı yapıştırın"}
          className="mt-1 h-11 w-full rounded-full border border-transparent bg-surface-2 px-4 text-sm text-ink placeholder:text-muted focus:border-brand/60 focus:bg-surface focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs font-medium text-bad">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!value.trim()} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg disabled:opacity-40">
          <Check className="size-4" />
          Kaydet
        </button>
        {has && (
          <button
            type="button"
            onClick={() => {
              removeKey();
              onDone?.();
            }}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-surface-3 px-4 text-sm font-semibold text-ink-2 hover:text-bad"
          >
            <Trash className="size-4" />
            Anahtarı sil
          </button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        Anahtar yalnızca bu telefonda, uygulamanın kendi alanında saklanır; hiçbir sunucuya gönderilmez. Gemini&apos;ye giden istekler doğrudan telefondan çıkar ve içinde kart numarası, IBAN, kimlik numarası bulunmaz.
      </p>
    </form>
  );
}

/** Üst bardaki ayarlar simgesi: Gemini anahtarı ve uygulama güncellemesi. Yalnızca telefon sürümünde görünür. */
export function SettingsButton() {
  const has = useHasGeminiKey();
  const update = useUpdateState();
  const [open, setOpen] = useState(false);
  // Esc ile kapat (pencere portal ile gövdeye taşındığı için odak dışarıda kalabilir: belge düzeyinde dinle)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!STANDALONE) return null;
  // Uyarı noktası: anahtar eksik ya da yeni sürüm var
  const attention = !has || update.phase === "available";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={!has ? "Ayarlar (Gemini anahtarı eksik)" : update.phase === "available" ? "Ayarlar (yeni sürüm var)" : "Ayarlar"}
        title="Ayarlar"
        className={cn("relative grid size-10 shrink-0 cursor-pointer place-items-center rounded-full transition-colors", attention ? "bg-warn-fill/20 text-warn" : "bg-surface-3 text-ink-2 hover:text-ink")}
      >
        <Settings className="size-[18px]" />
        {attention && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-warn-fill" />}
      </button>
      {/* Portal: üst bar backdrop-filter kullandığı için fixed konumlu çocuklar ekrana değil çubuğa göre hesaplanır */}
      {open &&
        createPortal(
        <div role="dialog" aria-modal="true" aria-label="Ayarlar" className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-3 sm:place-items-center print:hidden" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[28px] bg-surface p-5 shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold tracking-tight text-ink">Ayarlar</h2>
              <button type="button" aria-label="Kapat" onClick={() => setOpen(false)} className="grid size-9 cursor-pointer place-items-center rounded-full bg-surface-3 text-ink-2">
                <X className="size-4" />
              </button>
            </div>
            <h3 className="text-[15px] font-extrabold tracking-tight text-ink">Gemini anahtarı</h3>
            <div className="mt-2">
              <GeminiKeyForm onDone={() => setOpen(false)} />
            </div>
            <UpdateSection />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Anahtar yokken sayfanın üstünde görünen karşılama kartı (yalnızca telefon sürümü). */
export function GeminiKeyBanner() {
  const has = useHasGeminiKey();
  if (!STANDALONE || has) return null;
  return (
    <section aria-label="Gemini anahtarı gerekli" className="rounded-[28px] bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-warn-fill/20 text-warn">
          <KeyRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">Yapay zekâ için Gemini anahtarınızı ekleyin</h2>
          <p className="mt-1 text-sm text-ink-2">
            Ekstre okuma, abonelik/kesinti analizi ve sohbet Gemini ile çalışır. Anahtarı Google AI Studio&apos;dan alıp bir kez yapıştırmanız yeterli; ekstre okuma ve tablolar anahtarsız da çalışır.
          </p>
          <div className="mt-3">
            <GeminiKeyForm compact />
          </div>
        </div>
      </div>
    </section>
  );
}
