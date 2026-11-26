# Ekstre Avukatı

Kredi kartı / banka ekstresini (PDF veya CSV) yükleyip harcamaları analiz eden, gizli abonelikleri ve banka kesintilerini yakalayan Next.js uygulaması.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # maskeleme + ayrıştırma testleri (node:test + tsx)
npm run typecheck
```

## Mimari

| Katman | Dosya |
|---|---|
| Hassas veri maskeleme (sunucu, `server-only`) | `src/lib/privacy-masker.ts` |
| Yükleme API'si: çıkar → **maskele** → ayrıştır | `src/app/api/parse-statement/route.ts`, `src/lib/server/process-statement.ts` |
| PDF satır kurma (unpdf koordinatlarıyla) | `src/lib/server/pdf-text.ts` |
| CSV/PDF satır ayrıştırma, tutar/tarih | `src/lib/statement/parse.ts` |
| İşyeri adı temizleme, kategoriler | `src/lib/statement/merchant.ts`, `categories.ts` |
| Abonelik, kesinti, özet hesapları | `src/lib/statement/analyze.ts` |
| Tarayıcı içi depolama (localStorage) | `src/lib/client/statement-store.ts` |
| Arayüz | `src/components/` |

Maskeleme kuralları: 16 haneli kart → `**** **** **** 1234`; `TR` + 24 haneli IBAN ve 11 haneli T.C. Kimlik No → `[GİZLİ_VERİ]`.
Yüklenen dosya diske yazılmaz; yalnızca maskelenmiş sonuç tarayıcıya döner ve orada saklanır.

Örnek veri (tamamen kurgusal): `public/ornek-ekstre.csv`, aynı içeriğin metinli PDF'i `public/ornek-ekstre.pdf` ve metin katmanı olmayan taranmış hali `public/ornek-taranmis-ekstre.pdf`.

## Aşama 2 — Gemini

`.env.local` içinde `GEMINI_API_KEY` gerekir (bkz. `.env.example`). Anahtar yalnızca sunucuda okunur (`src/lib/server/gemini.ts`, `server-only`).
Model zinciri: `gemini-3.5-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` (404/429/zaman aşımında sıradakine geçer; `GEMINI_MODELS` ile değiştirilebilir).

| Rota | Ne yapar |
|---|---|
| `POST /api/parse-statement` (`vision=1`) | Taranmış PDF'i Gemini'ye verir, çıkan metni **maskeler**, sonra ayrıştırır. Kullanıcı onayı olmadan görüntü gönderilmez (`needsVision`). |
| `POST /api/analyze-statement` | Maskeli işlemlerden işyeri adı/kategori düzeltmesi, bulgular ve 3-5 maddelik tavsiye (Structured Output). |
| `POST /api/chat-statement` | Ekstreyle sohbet; yalnızca ekstre verisine dayanır. Soru da maskelenir. |

Gemini rakam hesaplamaz: toplamlar, hafta içi/sonu, aylık değişimler `src/lib/statement/facts.ts` içinde kodla hesaplanıp hazır verilir.
Yapay zekâ yalnızca işyeri adını ve (kural sözlüğünün tanımadığı açıklamalarda) kategoriyi değiştirebilir; tutar, tarih, yön ve banka kesintisi tespiti kodda kalır (`src/lib/statement/enrich.ts`).
Sunucu, istemciden gelen her işlemi ve soruyu yeniden doğrular/maskeler (`src/lib/server/validate.ts`) ve basit hız sınırı uygular.

## Aşama 3 — Çoklu ekstre, bütçe, dışa aktarma

| Özellik | Dosya |
|---|---|
| Ekstre kütüphanesi, birleştirme (örtüşen dönemlerde işlem ikiye katlanmaz), görünüm seçimi, v1 kaydı taşıma | `src/lib/statement/library.ts`, `src/lib/client/stores.ts` |
| Önceki aya göre değişim: toplam %, en çok artan 3 kategori, yeni abonelikler (kodla) | `src/lib/statement/trend.ts`, `src/components/trend-panel.tsx` |
| Kategori bütçe limitleri (%80 uyarı, %100 aşım) | `src/lib/statement/budget.ts`, `src/components/budget-panel.tsx` |
| CSV (Excel, `;`, ondalık virgül, BOM, formül enjeksiyonu korumalı) ve yazdırılabilir rapor | `src/lib/statement/report.ts`, `src/components/export-bar.tsx`, `print-report.tsx` |
| Tavsiye toplamı tekilleştirme: Gemini tasarruf TL'si yazmaz, `savingKeys` seçer; tutar kodla, her kalem bir kez | `src/lib/statement/savings.ts` |

localStorage anahtarları: `ekstre-avukati:statements:v2`, `:view:v1`, `:analyses:v1`, `:budgets:v1` (eski `:statement:v1` açılışta otomatik taşınır).
Çoklu ekstre denemesi için: `public/ornek-ekstre-eylul.csv` ve `public/ornek-ekstre-ekim.csv`.

## Telefon (Android APK) — sunucusuz

Aynı arayüz ve aynı ekstre/analiz/sohbet mantığı telefonun İÇİNDE çalışır; sunucu yoktur.
Yalnızca Gemini çağrıları internete çıkar ve yalnızca **maskelenmiş** metin gider (taranmış PDF'te görüntü, kullanıcı onayıyla).
Gemini anahtarını kullanıcı bir kez uygulamaya yapıştırır; yalnızca telefonda saklanır, APK'ya gömülü değildir.

```bash
npm run android:apk   # web paketi → Gradle → android/dist/ekstre-avukati-<sürüm>.apk
```

Gerekenler: JDK 17, Android SDK, `~/.ekstre/android-signing.properties` (imza; proje dışında, yedeğini alın — kaybolursa güncelleme üstüne kurulmaz).

| Parça | Nerede |
|---|---|
| Derleme anahtarı `STANDALONE=1` (statik dışa aktarım, `@engine` → yerel motor) | `next.config.ts`, `scripts/build-android-web.mjs` |
| API rotalarının telefondaki karşılığı | `src/lib/client/engine-local.ts` |
| Gemini anahtarı ekranı | `src/components/gemini-key.tsx`, `src/lib/gemini-key.ts` |
| WebView kabuğu: yerel sunum, dosya seçici, Paylaş, CSV kaydet, yazdır | `android/app/src/main/java/com/ekstreavukati/app/MainActivity.java` |

Güvenlik: WebView yalnızca uygulamanın kendi adresine ve `generativelanguage.googleapis.com`'a bağlanabilir, diğer her istek engellenir; yedekleme kapalıdır.
Önemli tuzak: Android, `_` ile başlayan klasörleri varsayılan olarak asset paketine almaz (`_next/`); `android/app/build.gradle` içindeki `ignoreAssetsPattern` bunu düzeltir — kaldırırsanız uygulama boş açılır.

### Uygulama içi güncelleme (ev ağı)

Her yeni sürümü telefona elle atmak gerekmez:

```bash
npm run android:apk     # sürümü kendisi artırır (kod +1, ad 1.<kod-1>) ve android/dist/latest.json yazar
npm run android:serve   # ev ağında güncelleme sunucusu (Ctrl+C ile kapanır); ekranda yazan adresi telefona girin
```

Telefonda: Ayarlar (dişli) → "Bilgisayarın adresi" → kaydet. Sonra uygulama her açılışta sessizce denetler;
yeni sürüm varsa üstte "Güncelle" çıkar → indirir → SHA-256/paket adı/sürüm doğrulanır → Android kurulum onayı.
İlk kurulumda "bu kaynaktan uygulama yükle" izni istenir. Telefon ve bilgisayar aynı Wi-Fi'de, sunucu açık olmalı.

Güvenlik: yalnızca özel ağ IPv4'üne (192.168.x.x, 10.x.x.x, 172.16-31.x.x) bağlanır, yönlendirme izlemez
(`src/lib/update-address.ts` ve `Updater.java` aynı kuralı uygular); sunucu yalnızca `/latest.json` ve APK'yı sunar;
asıl koruma Android'dedir — aynı anahtarla imzalanmamış APK mevcut uygulamanın üstüne kurulmaz.
Tuzak: ayarlar penceresi üst bardaki `backdrop-filter` yüzünden `fixed` konumunu kaybediyordu; bu yüzden portal ile gövdeye çiziliyor.
