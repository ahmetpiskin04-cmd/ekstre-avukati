package com.ekstreavukati.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Uygulama içi güncelleyici: ev ağındaki bilgisayardan (scripts/update-server.mjs) yeni APK'yı alır.
 *
 * Güvenlik katmanları:
 *  1. Adres yalnızca özel ağ IPv4'ü olabilir (internete çıkamaz); yönlendirme izlenmez.
 *  2. İndirilen dosyanın boyutu ve SHA-256'sı bilgi dosyasıyla eşleşmeli.
 *  3. Paket adı bu uygulamayla aynı ve sürüm kodu yüklüden büyük olmalı (eski sürüme geri alma yok).
 *  4. Asıl koruma Android'dedir: PackageInstaller, aynı anahtarla imzalanmamış bir APK'yı mevcut
 *     uygulamanın üstüne KURMAZ; kurulum her zaman kullanıcı onayı ister.
 *
 * Tüm ağ/dosya işleri arka planda yapılır; sonuçlar web arayüzüne "olay" olarak iletilir.
 */
final class Updater {

    interface Emit {
        void send(String json);
    }

    private static final String ACTION = "com.ekstreavukati.app.INSTALL_RESULT";
    private static final long MAX_APK_BYTES = 80L * 1024 * 1024;
    private static final Pattern PRIVATE_HOST = Pattern.compile("^(10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3})$");
    private static final Pattern FILE_NAME = Pattern.compile("^[A-Za-z0-9._-]{1,80}\\.apk$");
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-f]{64}$");

    private final Activity activity;
    private final Emit emit;
    private volatile boolean busy = false;

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        @SuppressWarnings("deprecation")
        public void onReceive(Context context, Intent intent) {
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                // Android'in "Güncellensin mi?" onay penceresi
                Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    try {
                        activity.startActivity(confirm);
                    } catch (Exception e) {
                        error("Kurulum penceresi açılamadı.");
                    }
                }
            } else if (status == PackageInstaller.STATUS_SUCCESS) {
                busy = false;
                emit.send("{\"type\":\"installed\"}");
            } else {
                busy = false;
                String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                if (status == PackageInstaller.STATUS_FAILURE_ABORTED) error("Kurulum iptal edildi.");
                else if (status == PackageInstaller.STATUS_FAILURE_CONFLICT || status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE)
                    error("Android bu dosyayı kurmadı: imza uyuşmuyor. Güncellemeyi yalnızca bu uygulamayı derlediğiniz bilgisayardan alabilirsiniz.");
                else error("Kurulum başarısız" + (msg != null ? ": " + msg : "."));
            }
        }
    };

    Updater(Activity activity, Emit emit) {
        this.activity = activity;
        this.emit = emit;
    }

    void register() {
        IntentFilter filter = new IntentFilter(ACTION);
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else activity.registerReceiver(receiver, filter);
    }

    void unregister() {
        try {
            activity.unregisterReceiver(receiver);
        } catch (IllegalArgumentException ignored) {
            // zaten kayıtsız
        }
    }

    // ---- Dışa açık işlemler (JS köprüsünden çağrılır) ----

    String appVersion() {
        try {
            PackageInfo pi = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            JSONObject o = new JSONObject();
            o.put("code", versionCode(pi));
            o.put("name", pi.versionName);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    void check(final String rawBase) {
        final String base = validBase(rawBase);
        if (base == null) {
            error("Geçersiz adres. Yalnızca ev ağı adresleri (192.168.x.x, 10.x.x.x, 172.16-31.x.x) kabul edilir.");
            return;
        }
        new Thread(() -> {
            try {
                JSONObject info = fetchInfo(base);
                JSONObject o = new JSONObject();
                o.put("type", "info");
                o.put("versionCode", info.getLong("versionCode"));
                o.put("versionName", info.getString("versionName"));
                o.put("size", info.getLong("size"));
                emit.send(o.toString());
            } catch (Exception e) {
                error(netMessage(e));
            }
        }, "update-check").start();
    }

    void install(final String rawBase) {
        final String base = validBase(rawBase);
        if (base == null) {
            error("Geçersiz adres.");
            return;
        }
        if (busy) return;
        busy = true;
        new Thread(() -> {
            File apk = null;
            try {
                JSONObject info = fetchInfo(base);
                long installedCode = versionCode(activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0));
                if (info.getLong("versionCode") <= installedCode) {
                    busy = false;
                    emit.send("{\"type\":\"uptodate\"}");
                    return;
                }

                // "Bu kaynaktan uygulama yükle" izni yoksa ayarı aç; kullanıcı dönünce tekrar dener
                if (!activity.getPackageManager().canRequestPackageInstalls()) {
                    busy = false;
                    activity.runOnUiThread(() -> {
                        try {
                            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
                        } catch (Exception ignored) {
                            // ayar ekranı açılamazsa kullanıcı elle verebilir
                        }
                    });
                    emit.send("{\"type\":\"need-permission\"}");
                    return;
                }

                apk = download(base, info);
                verifyPackage(apk, installedCode);
                emit.send("{\"type\":\"installing\"}");
                commit(apk);
                // Sonuç receiver ile gelir; dosya kurulum oturumuna kopyalandığı için silinebilir
            } catch (Exception e) {
                busy = false;
                error(e instanceof UserFacing ? e.getMessage() : netMessage(e));
            } finally {
                if (apk != null) //noinspection ResultOfMethodCallIgnored
                    apk.deleteOnExit();
            }
        }, "update-install").start();
    }

    // ---- İç işler ----

    /** Kullanıcıya olduğu gibi gösterilebilecek hata */
    private static final class UserFacing extends Exception {
        UserFacing(String m) {
            super(m);
        }
    }

    /** "http://192.168.1.23:8765" biçimini doğrular; özel ağ dışındaysa null. Web tarafındaki kuralla aynıdır. */
    static String validBase(String raw) {
        if (raw == null) return null;
        try {
            URL u = new URL(raw.trim());
            if (!"http".equals(u.getProtocol()) || u.getHost() == null || !PRIVATE_HOST.matcher(u.getHost()).matches()) return null;
            for (String part : u.getHost().split("\\.")) if (Integer.parseInt(part) > 255) return null;
            int port = u.getPort() == -1 ? 80 : u.getPort();
            if (port < 1 || port > 65535 || (u.getPath() != null && !u.getPath().isEmpty() && !"/".equals(u.getPath()))) return null;
            return "http://" + u.getHost() + ":" + port;
        } catch (Exception e) {
            return null;
        }
    }

    private HttpURLConnection open(String url, int readTimeoutMs) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(false); // yönlendirmeyle internete çıkarılamaz
        c.setConnectTimeout(4000);
        c.setReadTimeout(readTimeoutMs);
        c.setUseCaches(false);
        return c;
    }

    private JSONObject fetchInfo(String base) throws Exception {
        HttpURLConnection c = open(base + "/latest.json", 8000);
        try {
            if (c.getResponseCode() != 200) throw new UserFacing("Güncelleme sunucusu beklenen yanıtı vermedi (" + c.getResponseCode() + ").");
            StringBuilder sb = new StringBuilder();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) > 0 && sb.length() < 20000) sb.append(new String(buf, 0, n, "UTF-8"));
            }
            JSONObject o = new JSONObject(sb.toString());
            long size = o.getLong("size");
            if (!FILE_NAME.matcher(o.getString("file")).matches() || !SHA256.matcher(o.getString("sha256")).matches() || size <= 0 || size > MAX_APK_BYTES || o.getLong("versionCode") <= 0)
                throw new UserFacing("Güncelleme bilgisi geçersiz.");
            return o;
        } finally {
            c.disconnect();
        }
    }

    private File download(String base, JSONObject info) throws Exception {
        File dir = new File(activity.getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) throw new UserFacing("Geçici klasör oluşturulamadı.");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
            f.delete();
        File out = new File(dir, "update.apk");

        long expected = info.getLong("size");
        HttpURLConnection c = open(base + "/" + info.getString("file"), 30000);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try {
            if (c.getResponseCode() != 200) throw new UserFacing("APK indirilemedi (" + c.getResponseCode() + ").");
            long total = 0;
            int lastPercent = -1;
            try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > expected || total > MAX_APK_BYTES) throw new UserFacing("İndirilen dosya beklenenden büyük; iptal edildi.");
                    md.update(buf, 0, n);
                    os.write(buf, 0, n);
                    int percent = (int) (total * 100 / expected);
                    if (percent != lastPercent) {
                        lastPercent = percent;
                        emit.send("{\"type\":\"progress\",\"percent\":" + percent + "}");
                    }
                }
            }
            if (total != expected) throw new UserFacing("İndirme eksik kaldı. Tekrar deneyin.");
        } finally {
            c.disconnect();
        }

        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
        if (!hex.toString().equals(info.getString("sha256"))) {
            //noinspection ResultOfMethodCallIgnored
            out.delete();
            throw new UserFacing("Dosya doğrulanamadı (SHA-256 uyuşmuyor); kurulum yapılmadı.");
        }
        return out;
    }

    private void verifyPackage(File apk, long installedCode) throws Exception {
        PackageInfo pi = activity.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (pi == null) throw new UserFacing("İndirilen dosya geçerli bir uygulama değil.");
        if (!activity.getPackageName().equals(pi.packageName)) throw new UserFacing("İndirilen dosya bu uygulamaya ait değil; kurulum yapılmadı.");
        if (versionCode(pi) <= installedCode) throw new UserFacing("İndirilen sürüm yüklüden yeni değil.");
    }

    private void commit(File apk) throws Exception {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName());
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (InputStream in = new FileInputStream(apk); OutputStream os = session.openWrite("base.apk", 0, apk.length())) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                session.fsync(os);
            }
            Intent intent = new Intent(ACTION).setPackage(activity.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getBroadcast(activity, id, intent, flags).getIntentSender());
        }
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo pi) {
        return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
    }

    private String netMessage(Exception e) {
        if (e instanceof UserFacing) return e.getMessage();
        return "Bilgisayara ulaşılamadı. Aynı Wi-Fi'de olduğunuzdan ve bilgisayarda güncelleme sunucusunun (npm run android:serve) açık olduğundan emin olun.";
    }

    private void error(String message) {
        try {
            JSONObject o = new JSONObject();
            o.put("type", "error");
            o.put("message", message);
            emit.send(o.toString());
        } catch (Exception ignored) {
            // JSON üretilemezse sessiz kalınır
        }
    }
}
