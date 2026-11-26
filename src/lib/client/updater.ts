"use client";

import { useSyncExternalStore } from "react";
import { isNewer, parseUpdateAddress, type UpdateInfo } from "@/lib/update-address";
import { nativeBridge, type UpdateEvent } from "./native";

/**
 * Uygulama içi güncelleme durumu (yalnızca Android uygulamasında anlamlı).
 * Akış: adres kayıtlı → açılışta sessiz denetim → yeni sürüm varsa "Güncelle" → yerel kod indirir,
 * SHA-256 ve paket adını doğrular, Android kurulum penceresini açar.
 */
export type UpdatePhase = "idle" | "checking" | "uptodate" | "available" | "downloading" | "installing" | "need-permission" | "installed" | "error";

export interface UpdateState {
  phase: UpdatePhase;
  installed: { code: number; name: string } | null;
  info: UpdateInfo | null;
  percent: number;
  message: string | null;
  /** Kullanıcı üstteki "yeni sürüm" uyarısını kapattı (bu oturum için) */
  dismissed: boolean;
}

const ADDRESS_KEY = "ekstre-avukati:update-address:v1";
const IDLE: UpdateState = { phase: "idle", installed: null, info: null, percent: 0, message: null, dismissed: false };

let state: UpdateState = IDLE;
const listeners = new Set<() => void>();
let timeout: ReturnType<typeof setTimeout> | null = null;
let autoChecked = false;

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const useUpdateState = (): UpdateState =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => IDLE,
  );

export function readAddress(): string {
  try {
    return window.localStorage.getItem(ADDRESS_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Geçerli bir adres kaydeder; geçersizse false (ve hiçbir şey saklamaz). */
export function saveAddress(input: string): boolean {
  const parsed = parseUpdateAddress(input);
  if (!parsed) return false;
  try {
    window.localStorage.setItem(ADDRESS_KEY, `${parsed.host}:${parsed.port}`);
  } catch {
    /* depolama kapalıysa adres bu oturumda kullanılamaz */
  }
  listeners.forEach((l) => l());
  return true;
}

function clearTimer() {
  if (timeout) clearTimeout(timeout);
  timeout = null;
}

function handle(e: UpdateEvent) {
  clearTimer();
  switch (e.type) {
    case "info": {
      const info: UpdateInfo = { versionCode: e.versionCode, versionName: e.versionName, size: e.size };
      const code = state.installed?.code ?? 0;
      set({ info, phase: isNewer(info, code) ? "available" : "uptodate", message: null });
      break;
    }
    case "uptodate":
      set({ phase: "uptodate", message: null });
      break;
    case "progress":
      set({ phase: "downloading", percent: e.percent });
      break;
    case "installing":
      set({ phase: "installing" });
      break;
    case "need-permission":
      set({ phase: "need-permission" });
      break;
    case "installed":
      set({ phase: "installed" });
      break;
    case "error":
      set({ phase: "error", message: e.message });
      break;
  }
}

/** Uygulama açılırken bir kez: sürümü oku, olay kanalını bağla. Köprü yoksa (tarayıcı) hiçbir şey yapmaz. */
export function initUpdater(): () => void {
  const bridge = nativeBridge();
  if (!bridge?.appVersion) return () => {};
  try {
    const v = JSON.parse(bridge.appVersion()) as { code: number; name: string };
    set({ installed: { code: v.code, name: v.name } });
  } catch {
    /* sürüm okunamazsa karşılaştırma yapılamaz; denetim yine de bilgi gösterir */
  }
  window.__eaUpdateEvent = (json) => {
    try {
      handle(JSON.parse(json) as UpdateEvent);
    } catch {
      /* bozuk olay yok sayılır */
    }
  };
  // Adres kayıtlıysa açılışta bir kez sessizce denetle
  if (!autoChecked && readAddress()) {
    autoChecked = true;
    void checkForUpdate({ silent: true });
  }
  return () => {
    delete window.__eaUpdateEvent;
  };
}

function armTimeout(ms: number, message: string) {
  clearTimer();
  timeout = setTimeout(() => set({ phase: "error", message }), ms);
}

export async function checkForUpdate(opts: { silent?: boolean } = {}) {
  const bridge = nativeBridge();
  const address = parseUpdateAddress(readAddress());
  if (!bridge?.checkUpdate || !address) {
    if (!opts.silent) set({ phase: "error", message: "Önce bilgisayarın adresini girin (ör. 192.168.1.23:8765)." });
    return;
  }
  set({ phase: "checking", message: null, dismissed: false });
  armTimeout(15_000, "Bilgisayara ulaşılamadı. Aynı Wi-Fi'de misiniz ve bilgisayarda güncelleme sunucusu (npm run android:serve) açık mı?");
  bridge.checkUpdate(address.base);
}

export function installUpdate() {
  const bridge = nativeBridge();
  const address = parseUpdateAddress(readAddress());
  if (!bridge?.installUpdate || !address) return;
  set({ phase: "downloading", percent: 0, message: null });
  armTimeout(180_000, "İndirme tamamlanamadı. Bağlantıyı kontrol edip tekrar deneyin.");
  bridge.installUpdate(address.base);
}

export const dismissUpdate = () => set({ dismissed: true });
