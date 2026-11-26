/* Ekstre Avukatı service worker.
 *
 * Tek görevi: telefonun "Paylaş → Ekstre Avukatı" menüsünden gelen dosyayı (POST /share-target)
 * yakalayıp geçici olarak tarayıcı önbelleğine koymak ve uygulamaya yönlendirmek.
 * Finansal veri BURADA kalıcı saklanmaz: uygulama dosyayı okuyunca önbellek hemen silinir.
 * Ağ isteklerini önbelleğe ALMAZ (API yanıtları dahil hiçbir şey); çevrimdışı mod yoktur,
 * çünkü ekstre sunucuda işlenir.
 */
const SHARE_CACHE = "ea-share-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "POST" || url.pathname !== "/share-target") return;

  event.respondWith(
    (async () => {
      try {
        const form = await req.formData();
        const files = form.getAll("files").filter((f) => f && typeof f === "object" && "name" in f && f.size > 0);
        const cache = await caches.open(SHARE_CACHE);
        for (const k of await cache.keys()) await cache.delete(k);
        let i = 0;
        for (const f of files) {
          await cache.put(
            `/__shared/${i++}`,
            new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream", "X-File-Name": encodeURIComponent(f.name) } }),
          );
        }
        return Response.redirect(`/?paylasilan=${files.length}`, 303);
      } catch {
        return Response.redirect("/?paylasilan=hata", 303);
      }
    })(),
  );
});
