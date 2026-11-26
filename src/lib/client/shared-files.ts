"use client";

/**
 * "Paylaş" menüsünden gelen dosyaların bileşenler arası kuyruğu.
 * Dinleyici sonradan bağlansa bile bekleyen dosyalar ona teslim edilir (olay kaçırılmaz).
 */
let pending: File[] = [];
let listener: ((files: File[]) => void) | null = null;

export function pushShared(files: File[]) {
  if (!files.length) return;
  if (listener) listener(files);
  else pending = [...pending, ...files];
}

export function subscribeShared(cb: (files: File[]) => void): () => void {
  listener = cb;
  if (pending.length) {
    const f = pending;
    pending = [];
    cb(f);
  }
  return () => {
    if (listener === cb) listener = null;
  };
}

const SHARE_CACHE = "ea-share-v1";

/** Service worker'ın önbelleğe koyduğu paylaşılan dosyaları okuyup önbelleği boşaltır. */
export async function drainSharedCache(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(SHARE_CACHE);
  const keys = await cache.keys();
  const files: File[] = [];
  for (const req of keys) {
    const res = await cache.match(req);
    if (!res) continue;
    const name = decodeURIComponent(res.headers.get("X-File-Name") ?? "ekstre");
    files.push(new File([await res.blob()], name, { type: res.headers.get("Content-Type") ?? "" }));
  }
  for (const req of keys) await cache.delete(req); // finansal veri geçici: okunur okunmaz silinir
  return files;
}
