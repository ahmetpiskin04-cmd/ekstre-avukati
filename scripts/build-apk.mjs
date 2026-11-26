// Tek komutla APK: web paketi (sunucusuz) → Gradle → android/dist/ekstre-avukati-<sürüm>.apk
//
// Her derlemede sürüm KENDİLİĞİNDEN artar (versionCode +1, versionName 1.<kod-1>); aksi halde telefon
// yeni sürümü görmez. Yeniden derleyip sürümü sabit tutmak için: npm run android:apk -- --no-bump
// Sonunda android/dist/latest.json yazılır; telefondaki güncelleyici bunu okur (npm run android:serve).
//
// Kullanım:  npm run android:apk
// Gerekenler: JDK 17 (JAVA_HOME), Android SDK (ANDROID_HOME), imza bilgisi ~/.ekstre/android-signing.properties
// Gradle: GRADLE_BIN ortam değişkeni ya da bu makinede daha önce kurulu olan 8.14.3 dağıtımı.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = join(root, "android");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`✗ Başarısız: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(join(homedir(), ".ekstre", "android-signing.properties"))) {
  console.error("✗ İmza bilgisi yok: ~/.ekstre/android-signing.properties (keytool ile bir anahtar deposu oluşturun).");
  process.exit(1);
}

function findGradle() {
  if (process.env.GRADLE_BIN && existsSync(process.env.GRADLE_BIN)) return process.env.GRADLE_BIN;
  const dists = join(homedir(), ".gradle", "wrapper", "dists", "gradle-8.14.3-all");
  if (existsSync(dists)) {
    for (const hash of readdirSync(dists)) {
      const bin = join(dists, hash, "gradle-8.14.3", "bin", process.platform === "win32" ? "gradle.bat" : "gradle");
      if (existsSync(bin)) return bin;
    }
  }
  console.error("✗ Gradle bulunamadı. GRADLE_BIN ortam değişkenini ayarlayın.");
  process.exit(1);
}

console.log("1/3 Web paketi (sunucusuz) derleniyor…");
run("node", [join(root, "scripts", "build-android-web.mjs")], { cwd: root });

console.log("2/3 Android uygulaması derleniyor…");
const gradle = findGradle();
const gradleFilePath = join(androidDir, "app", "build.gradle");
const originalGradle = readFileSync(gradleFilePath, "utf8");
const currentCode = Number((originalGradle.match(/versionCode\s+(\d+)/) || [])[1] ?? 1);
if (!process.argv.includes("--no-bump")) {
  const next = currentCode + 1;
  writeFileSync(
    gradleFilePath,
    originalGradle.replace(/versionCode\s+\d+/, `versionCode ${next}`).replace(/versionName\s+'[^']*'/, `versionName '1.${next - 1}'`),
    "utf8",
  );
  console.log(`   sürüm: ${currentCode} → ${next}`);
}
// .bat dosyalarını doğrudan çalıştırmak Windows'ta kabuk ister; argümanlar sabit olduğu için güvenli
const g = spawnSync(gradle, ["assembleRelease", "--offline", "-q"], { cwd: androidDir, stdio: "inherit", shell: process.platform === "win32" });
if (g.status !== 0) {
  writeFileSync(gradleFilePath, originalGradle, "utf8"); // başarısız derlemede sürüm artışı geri alınır
  console.error("✗ Gradle derlemesi başarısız; sürüm numarası eski haline döndürüldü.");
  process.exit(g.status ?? 1);
}

console.log("3/3 APK kopyalanıyor…");
const gradleFile = readFileSync(join(androidDir, "app", "build.gradle"), "utf8");
const version = (gradleFile.match(/versionName\s+'([^']+)'/) || [])[1] ?? "x";
const built = join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
if (!existsSync(built)) {
  console.error("✗ app-release.apk üretilmedi (imza yapılandırması eksik olabilir).");
  process.exit(1);
}
const dist = join(androidDir, "dist");
mkdirSync(dist, { recursive: true });
const target = join(dist, `ekstre-avukati-${version}.apk`);
copyFileSync(built, target);

// Güncelleme bilgisi: telefon bunu okuyup yeni sürüm olup olmadığına, dosyanın boyut ve SHA-256'sına bakar
const code = Number((readFileSync(gradleFilePath, "utf8").match(/versionCode\s+(\d+)/) || [])[1]);
const bytes = readFileSync(target);
const info = {
  versionCode: code,
  versionName: version,
  file: `ekstre-avukati-${version}.apk`,
  size: statSync(target).size,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  builtAt: new Date().toISOString(),
};
writeFileSync(join(dist, "latest.json"), JSON.stringify(info, null, 2) + "\n", "utf8");
console.log(`✓ APK hazır: ${target}`);
console.log(`✓ Güncelleme bilgisi: sürüm ${version} (kod ${code}), ${(info.size / 1024 / 1024).toFixed(1)} MB`);
