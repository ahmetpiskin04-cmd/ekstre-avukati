"use client";

/**
 * Android uygulamasının (WebView) sunduğu köprü. Tarayıcıda/PWA'da yoktur; kod her iki ortamda da
 * çalışsın diye çağıran taraf önce `nativeBridge()` ile var mı diye bakar.
 */
export interface AndroidBridge {
  /** İndirilenler klasörüne dosya yazar (base64 içerik). Başarılıysa true. */
  saveFile(name: string, mime: string, base64: string): boolean;
  /** WebView içeriğini Android yazdırma/PDF'e kaydet penceresine gönderir. */
  print(title: string): void;
  /** Başka uygulamadan ("Paylaş") gelip henüz alınmamış dosyalar: JSON [{name,type,url}] */
  pendingShares(): string;
  /** Yüklü sürüm: JSON {"code":2,"name":"1.1"} */
  appVersion?(): string;
  /** Güncelleme sunucusuna sorar (asenkron; sonuç __eaUpdateEvent ile gelir). */
  checkUpdate?(baseUrl: string): void;
  /** Yeni APK'yı indirir, doğrular ve Android kurulum penceresini açar (olaylarla ilerler). */
  installUpdate?(baseUrl: string): void;
}

/** Yerel kodun güncelleme sırasında gönderdiği olaylar (window.__eaUpdateEvent). */
export type UpdateEvent =
  | { type: "info"; versionCode: number; versionName: string; size: number }
  | { type: "uptodate" }
  | { type: "progress"; percent: number }
  | { type: "installing" }
  | { type: "need-permission" }
  | { type: "installed" }
  | { type: "error"; message: string };

declare global {
  interface Window {
    AndroidBridge?: AndroidBridge;
    /** Uygulama açıkken yeni bir paylaşım gelirse yerel kod bunu çağırır */
    __eaShared?: (json: string) => void;
    /** Güncelleme olayları: JSON metni (UpdateEvent) */
    __eaUpdateEvent?: (json: string) => void;
  }
}

export const nativeBridge = (): AndroidBridge | null => (typeof window !== "undefined" ? (window.AndroidBridge ?? null) : null);

interface SharedItem {
  name: string;
  type: string;
  url: string;
}

/** Yerel koddan gelen paylaşım listesini (JSON) File nesnelerine çevirir. Dosya içeriği cihazdan okunur. */
export async function sharesToFiles(json: string): Promise<File[]> {
  let items: SharedItem[] = [];
  try {
    items = JSON.parse(json) as SharedItem[];
  } catch {
    return [];
  }
  const files: File[] = [];
  for (const it of items) {
    if (!it?.url || !it.name) continue;
    try {
      const res = await fetch(it.url);
      if (res.ok) files.push(new File([await res.blob()], it.name, { type: it.type || "" }));
    } catch {
      /* okunamayan dosya atlanır; kullanıcı "Dosya seç" ile yükleyebilir */
    }
  }
  return files;
}
