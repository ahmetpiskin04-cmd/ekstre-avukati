// Telefon (APK) için sunucusuz web paketini üretir: out-android/ → android/app/src/main/assets/www
//
// Statik dışa aktarım API rotalarını (route handler) kabul etmez; bu yüzden derleme sırasında
// src/app/api ve src/app/share-target "_" önekli (yönlendirmeye girmeyen) klasörlere taşınır ve
// iş bitince — hata olsa bile — geri konur. Kalan bir yarım derleme varsa başlangıçta geri alınır.
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hidden = [
  ["src/app/api", "src/app/_api_off"],
  ["src/app/share-target", "src/app/_share_target_off"],
].map(([a, b]) => [join(root, a), join(root, b)]);

function restore() {
  for (const [orig, off] of hidden) {
    if (existsSync(off) && !existsSync(orig)) renameSync(off, orig);
  }
}

restore(); // önceki yarım kalmış derlemeden kalan varsa
for (const [orig, off] of hidden) renameSync(orig, off);

let status = 1;
try {
  rmSync(join(root, "out-android"), { recursive: true, force: true });
  const r = spawnSync("npx", ["next", "build"], { cwd: root, stdio: "inherit", shell: true, env: { ...process.env, STANDALONE: "1" } });
  status = r.status ?? 1;
} finally {
  restore();
}
if (status !== 0) process.exit(status);

const out = join(root, "out-android");
if (!existsSync(join(out, "index.html"))) {
  console.error("out-android/index.html bulunamadı: dışa aktarım başarısız.");
  process.exit(1);
}
const www = join(root, "android", "app", "src", "main", "assets", "www");
rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(out, www, { recursive: true });
// Telefonda gereksiz: service worker ve web manifest/paylaşım dosyaları (yerel kod paylaşımı kendi alır)
rmSync(join(www, "sw.js"), { force: true });
console.log(`✓ Web paketi hazır: ${www} (${readdirSync(www).length} öğe)`);
