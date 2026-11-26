"use client";

import { ArrowDownToLine, CircleCheck, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { nativeBridge } from "@/lib/client/native";
import { checkForUpdate, dismissUpdate, installUpdate, readAddress, saveAddress, useUpdateState } from "@/lib/client/updater";
import { DEFAULT_UPDATE_PORT, formatSize } from "@/lib/update-address";
import { cn } from "./ui";

const noopSubscribe = () => () => {};
/** Güncelleyici yalnızca Android uygulamasında (köprü varsa) vardır; tarayıcıda hiçbir şey çizilmez. */
export function useUpdaterAvailable(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => Boolean(nativeBridge()?.checkUpdate),
    () => false,
  );
}

const busyPhases = new Set(["checking", "downloading", "installing"]);

/** Ayarlar penceresindeki bölüm: bilgisayar adresi, denetle, indir ve kur. */
export function UpdateSection() {
  const available = useUpdaterAvailable();
  const u = useUpdateState();
  const [address, setAddress] = useState(() => readAddress());
  const [addrError, setAddrError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!available) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!saveAddress(address)) {
      setAddrError("Yalnızca ev ağı adresleri kabul edilir (192.168.x.x, 10.x.x.x veya 172.16–31.x.x). Örnek: 192.168.1.23:" + DEFAULT_UPDATE_PORT);
      setSaved(false);
      return;
    }
    setAddrError(null);
    setSaved(true);
    void checkForUpdate();
  }

  const busy = busyPhases.has(u.phase);

  return (
    <section aria-label="Uygulama güncellemesi" className="mt-5 border-t border-line pt-5">
      <h3 className="text-[15px] font-extrabold tracking-tight text-ink">Uygulama güncellemesi</h3>
      <p className="mt-0.5 text-xs text-muted">{u.installed ? `Yüklü sürüm ${u.installed.name} (${u.installed.code})` : "Sürüm okunamadı"}</p>

      <form onSubmit={submit} className="mt-3 space-y-2">
        <label className="block">
          <span className="text-xs font-semibold text-ink-2">Bilgisayarın adresi</span>
          <input
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setSaved(false);
            }}
            inputMode="decimal"
            autoComplete="off"
            placeholder={`192.168.1.23:${DEFAULT_UPDATE_PORT}`}
            className="mt-1 h-11 w-full rounded-full border border-transparent bg-surface-2 px-4 text-sm text-ink placeholder:text-muted focus:border-brand/60 focus:bg-surface focus:outline-none"
          />
        </label>
        {addrError && (
          <p role="alert" className="text-xs font-medium text-bad">
            {addrError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy || !address.trim()} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg disabled:opacity-40">
            <RefreshCw className={cn("size-4", u.phase === "checking" && "animate-spin")} />
            {saved ? "Denetle" : "Kaydet ve denetle"}
          </button>
          {readAddress() && !saved && (
            <button type="button" disabled={busy} onClick={() => void checkForUpdate()} className="h-10 cursor-pointer rounded-full bg-surface-3 px-4 text-sm font-semibold text-ink-2 hover:text-ink disabled:opacity-40">
              Güncellemeyi denetle
            </button>
          )}
        </div>
      </form>

      <UpdateStatus />

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Bilgisayarda <code className="rounded bg-surface-2 px-1 font-mono">npm run android:serve</code> açık ve telefon aynı Wi-Fi&apos;de olmalı. Android, uygulamanın imzasını doğrular; farklı imzalı bir dosya kurulmaz.
      </p>
    </section>
  );
}

function UpdateStatus() {
  const u = useUpdateState();
  switch (u.phase) {
    case "checking":
      return (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <LoaderCircle className="size-4 animate-spin" /> Denetleniyor…
        </p>
      );
    case "uptodate":
      return (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm font-medium text-good">
          <CircleCheck className="size-4" /> Uygulama güncel.
        </p>
      );
    case "available":
      return (
        <div className="mt-3 rounded-2xl bg-accent-soft p-4">
          <p className="text-sm font-bold text-ink">
            Yeni sürüm {u.info?.versionName} hazır{u.info ? ` (${formatSize(u.info.size)})` : ""}
          </p>
          <button type="button" onClick={installUpdate} className="mt-2 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg">
            <ArrowDownToLine className="size-4" /> İndir ve kur
          </button>
        </div>
      );
    case "downloading":
      return <Progress percent={u.percent} />;
    case "installing":
      return (
        <p role="status" className="mt-3 text-sm text-ink-2">
          Android kurulum onayı bekleniyor. Onayladığınızda uygulama yenilenir; ardından yeniden açın.
        </p>
      );
    case "need-permission":
      return (
        <p role="status" className="mt-3 rounded-2xl bg-warn-fill/15 p-3 text-sm text-ink-2">
          Android&apos;in &quot;bu kaynaktan uygulama yükle&quot; izni gerekiyor. Açılan ayarda izni verip geri dönün, sonra &quot;İndir ve kur&quot;a yeniden dokunun.
          <button type="button" onClick={installUpdate} className="mt-2 block h-9 cursor-pointer rounded-full bg-ink px-4 text-xs font-semibold text-bg">
            Tekrar dene
          </button>
        </p>
      );
    case "installed":
      return (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm font-medium text-good">
          <CircleCheck className="size-4" /> Kuruldu. Uygulamayı kapatıp yeniden açın.
        </p>
      );
    case "error":
      return (
        <p role="alert" className="mt-3 rounded-2xl bg-bad-fill/10 p-3 text-sm text-bad">
          {u.message}
        </p>
      );
    default:
      return null;
  }
}

function Progress({ percent }: { percent: number }) {
  return (
    <div className="mt-3" role="status" aria-label="İndiriliyor">
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>İndiriliyor…</span>
        <span className="tabular font-semibold">%{percent}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Yeni sürüm bulunduğunda sayfanın üstünde görünen kısa uyarı (dokununca doğrudan indirip kurar). */
export function UpdateBanner() {
  const available = useUpdaterAvailable();
  const u = useUpdateState();
  if (!available || u.dismissed) return null;
  if (!["available", "downloading", "installing", "need-permission", "installed"].includes(u.phase)) return null;

  return (
    <section aria-label="Yeni sürüm" className="flex items-center gap-3 rounded-[28px] bg-surface p-4 shadow-card">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <ArrowDownToLine className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        {u.phase === "available" && (
          <>
            <p className="text-sm font-bold text-ink">Yeni sürüm {u.info?.versionName} hazır</p>
            <p className="text-xs text-muted">{u.info ? formatSize(u.info.size) : ""} · tek dokunuşla kurulur</p>
          </>
        )}
        {u.phase === "downloading" && <Progress percent={u.percent} />}
        {u.phase === "installing" && <p className="text-sm text-ink-2">Android kurulum onayı bekleniyor…</p>}
        {u.phase === "need-permission" && <p className="text-sm text-ink-2">Kurulum izni verip geri dönün, sonra tekrar dokunun.</p>}
        {u.phase === "installed" && <p className="text-sm font-medium text-good">Kuruldu. Uygulamayı yeniden açın.</p>}
      </div>
      {(u.phase === "available" || u.phase === "need-permission") && (
        <button type="button" onClick={installUpdate} className="h-10 shrink-0 cursor-pointer rounded-full bg-ink px-5 text-sm font-semibold text-bg">
          {u.phase === "available" ? "Güncelle" : "Tekrar dene"}
        </button>
      )}
      {u.phase === "available" && (
        <button type="button" aria-label="Şimdi değil" onClick={dismissUpdate} className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-surface-3 text-ink-2">
          <X className="size-4" />
        </button>
      )}
    </section>
  );
}
