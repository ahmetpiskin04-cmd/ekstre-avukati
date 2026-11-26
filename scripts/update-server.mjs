// Ev ağı güncelleme sunucusu: telefondaki uygulama yeni APK'yı buradan alır.
//
// Kullanım:  npm run android:serve          (kapatmak için Ctrl+C)
// Telefondaki uygulamada Ayarlar → "Bilgisayarın adresi" alanına bu betiğin yazdığı adresi girin.
//
// Yalnızca İKİ yol sunulur: /latest.json ve onun işaret ettiği APK dosyası. Başka hiçbir dosya,
// klasör listesi veya proje içeriği sunulmaz. APK'da gizli bilgi yoktur (Gemini anahtarı
// uygulamaya telefonda girilir); yine de yalnızca ev ağınıza açın.
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "android", "dist");
const port = Number(process.env.UPDATE_PORT || 8765);

function latest() {
  const f = join(dist, "latest.json");
  if (!existsSync(f)) return null;
  try {
    const info = JSON.parse(readFileSync(f, "utf8"));
    // Dosya adı yalnızca düz bir ad olmalı (yol gezintisi imkânsız)
    return /^[A-Za-z0-9._-]+\.apk$/.test(info.file) ? info : null;
  } catch {
    return null;
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const info = latest();
  const log = (code) => console.log(`${new Date().toLocaleTimeString("tr-TR")}  ${req.socket.remoteAddress?.replace("::ffff:", "")}  ${req.method} ${url.pathname}  ${code}`);

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return log(405);
  }
  if (!info) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" }).end("Henüz APK derlenmedi: npm run android:apk");
    return log(503);
  }
  if (url.pathname === "/latest.json") {
    const body = JSON.stringify(info);
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : body);
    return log(200);
  }
  if (url.pathname === `/${info.file}`) {
    const f = join(dist, info.file);
    if (!existsSync(f)) {
      res.writeHead(404).end();
      return log(404);
    }
    res.writeHead(200, { "Content-Type": "application/vnd.android.package-archive", "Content-Length": statSync(f).size, "Cache-Control": "no-store" });
    if (req.method === "HEAD") res.end();
    else createReadStream(f).pipe(res);
    return log(200);
  }
  res.writeHead(404).end();
  log(404);
});

server.listen(port, "0.0.0.0", () => {
  const info = latest();
  console.log("Ekstre Avukatı güncelleme sunucusu çalışıyor.\n");
  console.log(info ? `Sunulan sürüm: ${info.versionName} (kod ${info.versionCode})\n` : "UYARI: henüz APK yok — önce `npm run android:apk` çalıştırın.\n");
  console.log("Telefondaki uygulamada Ayarlar → Bilgisayarın adresi alanına şunlardan biri:");
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) console.log(`   ${a.address}:${port}   (${name})`);
    }
  }
  console.log("\nWindows güvenlik duvarı sorarsa yalnızca ÖZEL ağlara izin verin. Kapatmak için Ctrl+C.\n");
});
