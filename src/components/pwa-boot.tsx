"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { nativeBridge, sharesToFiles } from "@/lib/client/native";
import { drainSharedCache, pushShared } from "@/lib/client/shared-files";
import { initUpdater } from "@/lib/client/updater";
import { STANDALONE } from "@/lib/gemini-key";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * PWA katmanı: service worker kaydı, "Paylaş" menüsünden gelen dosyaların uygulamaya alınması
 * ve (Android'de) "Ana ekrana ekle" önerisi.
 */
export function PwaBoot() {
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Telefon (APK): "Paylaş → Ekstre Avukatı" dosyalarını yerel koddan al (service worker gerekmez).
  useEffect(() => {
    if (!STANDALONE) return;
    const take = (json: string) => void sharesToFiles(json).then(pushShared);
    const bridge = nativeBridge();
    if (bridge) take(bridge.pendingShares()); // uygulama paylaşımla açıldıysa bekleyenler
    window.__eaShared = take; // uygulama açıkken gelen yeni paylaşımlar
    const stopUpdater = initUpdater(); // sürümü oku, güncelleme olaylarını bağla, adres kayıtlıysa sessizce denetle
    return () => {
      delete window.__eaShared;
      stopUpdater();
    };
  }, []);

  useEffect(() => {
    if (STANDALONE) return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* kayıt başarısızsa uygulama yine çalışır; yalnızca "Paylaş" kısayolu devre dışı kalır */
      });
    }

    const params = new URLSearchParams(window.location.search);
    const shared = params.get("paylasilan");
    if (shared) {
      window.history.replaceState({}, "", window.location.pathname);
      if (shared === "hata" || shared === "sw") {
        // Service worker henüz devrede değildi: dosya sunucuya ulaşmadı, kaybolmadı.
        // Kullanıcıdan dosyayı bir kez daha paylaşmasını isteriz.
        setTimeout(() => setNotice("Paylaşım şu an alınamadı. Birkaç saniye sonra dosyayı tekrar paylaşın ya da \"Dosya seç\" ile yükleyin."), 0);
      } else {
        drainSharedCache()
          .then((files) => pushShared(files))
          .catch(() => setNotice("Paylaşılan dosya okunamadı. \"Dosya seç\" ile yükleyin."));
      }
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (notice) {
    return (
      <div role="status" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-start gap-3 rounded-3xl bg-ink p-4 text-sm text-bg shadow-lift print:hidden">
        <Share className="mt-0.5 size-4 shrink-0" />
        <p className="flex-1">{notice}</p>
        <button type="button" aria-label="Kapat" onClick={() => setNotice(null)} className="cursor-pointer opacity-70 hover:opacity-100">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  if (!installEvt || dismissed) return null;
  return (
    <div role="dialog" aria-label="Uygulamayı yükle" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-3xl bg-surface p-4 shadow-lift print:hidden">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <Download className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">Ana ekrana ekle</p>
        <p className="text-xs text-muted">Uygulama gibi açılsın; bankanızdan ekstreyi doğrudan buraya paylaşabilin.</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          await installEvt.prompt();
          setInstallEvt(null);
        }}
        className="h-9 shrink-0 cursor-pointer rounded-full bg-ink px-4 text-xs font-semibold text-bg"
      >
        Ekle
      </button>
      <button type="button" aria-label="Şimdi değil" onClick={() => setDismissed(true)} className="cursor-pointer text-muted hover:text-ink">
        <X className="size-4" />
      </button>
    </div>
  );
}
