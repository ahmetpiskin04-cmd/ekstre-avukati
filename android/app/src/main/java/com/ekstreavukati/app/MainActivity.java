package com.ekstreavukati.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Ekstre Avukatı — sunucusuz WebView kabuğu.
 *
 * Arayüz ve tüm ekstre işleme mantığı assets/www içindeki web paketinde çalışır; bu sınıf yalnızca
 * Android'e özgü işleri yapar: paketi güvenli bir yerel adresten sunmak, dosya seçici, "Paylaş" ile
 * gelen dosyaları almak, CSV'yi İndirilenler'e yazmak ve yazdırmak.
 *
 * Gizlilik: WebView yalnızca uygulamanın kendi adresine ve Gemini API'sine bağlanabilir; başka
 * her ağ isteği engellenir. Yedekleme kapalıdır (AndroidManifest).
 */
public class MainActivity extends Activity {

    /** Paket bu sanal adresten sunulur (gerçek bir sunucu değildir; tüm istekleri aşağıda biz karşılarız). */
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/";
    private static final String GEMINI_HOST = "generativelanguage.googleapis.com";
    private static final int REQ_FILE_CHOOSER = 4711;

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private Updater updater;

    // ---- "Paylaş → Ekstre Avukatı" ----
    private static final class Shared {
        String id;
        String name;
        String type;
        Uri uri;
    }

    private final Object lock = new Object();
    private final Map<String, Shared> sharedById = new HashMap<>();
    private final List<Shared> pendingShares = new ArrayList<>();
    private boolean jsReady = false;
    private int sharedCounter = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.window_bg));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage: ekstreler ve Gemini anahtarı burada kalır
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);

        // Güncelleyici: olaylar JS tarafındaki window.__eaUpdateEvent'e iletilir
        updater = new Updater(this, json -> runOnUiThread(() -> web.evaluateJavascript(
                "window.__eaUpdateEvent && window.__eaUpdateEvent(" + JSONObject.quote(json) + ")", null)));
        updater.register();

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new AppChromeClient());

        handleIntent(getIntent());
        web.loadUrl(START_URL);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        updater.unregister();
        web.destroy();
        super.onDestroy();
    }

    // ------------------------------------------------------------------------------------------
    // WebView: yerel paketi sun, dışarıya çıkışı kısıtla
    // ------------------------------------------------------------------------------------------

    private final class AppClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String host = uri.getHost();
            if (HOST.equals(host)) return serve(uri.getPath());
            if (GEMINI_HOST.equals(host)) return null; // yapay zekâ çağrıları normal ağdan
            // Başka her şey (izleyici, harici font, yanlışlıkla gömülü bir bağlantı...) engellenir
            return blocked();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (HOST.equals(uri.getHost())) return false;
            // Uygulamadan çıkan bağlantılar tarayıcıda açılır; WebView başka sayfaya gitmez
            if ("https".equals(uri.getScheme())) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // tarayıcı yoksa sessizce yok say
                }
            }
            return true;
        }
    }

    private WebResourceResponse serve(String path) {
        String p = (path == null || path.isEmpty() || path.equals("/")) ? "/index.html" : path;

        if (p.startsWith("/__shared/")) return serveShared(p.substring("/__shared/".length()));
        if (p.contains("..")) return blocked();

        String rel = p.substring(1);
        // Next dışa aktarımı temiz adresleri .html olarak yazar ("/x" -> x.html)
        String[] candidates = {"www/" + rel, "www/" + rel + ".html", "www/" + rel + "/index.html"};
        for (String c : candidates) {
            try {
                InputStream in = getAssets().open(c);
                String name = c.toLowerCase(Locale.ROOT);
                return response(mimeFor(name), in, 200, "OK");
            } catch (IOException ignored) {
                // sıradaki adayı dene
            }
        }
        return response("text/plain", new ByteArrayInputStream("yok".getBytes()), 404, "Not Found");
    }

    private WebResourceResponse serveShared(String id) {
        Shared item;
        synchronized (lock) {
            item = sharedById.get(id);
        }
        if (item == null) return blocked();
        try {
            InputStream in = getContentResolver().openInputStream(item.uri);
            if (in == null) return blocked();
            return response(item.type != null ? item.type : "application/octet-stream", in, 200, "OK");
        } catch (Exception e) {
            return blocked();
        }
    }

    private static WebResourceResponse blocked() {
        return response("text/plain", new ByteArrayInputStream(new byte[0]), 403, "Forbidden");
    }

    private static WebResourceResponse response(String mime, InputStream in, int code, String reason) {
        boolean text = mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("xml") || mime.contains("svg");
        WebResourceResponse r = new WebResourceResponse(mime, text ? "utf-8" : null, in);
        r.setStatusCodeAndReasonPhrase(code, reason);
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        r.setResponseHeaders(h);
        return r;
    }

    private static String mimeFor(String name) {
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js") || name.endsWith(".mjs")) return "text/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".json") || name.endsWith(".webmanifest")) return "application/json";
        if (name.endsWith(".txt")) return "text/plain";
        if (name.endsWith(".csv")) return "text/csv";
        if (name.endsWith(".pdf")) return "application/pdf";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".ico")) return "image/x-icon";
        if (name.endsWith(".woff2")) return "font/woff2";
        if (name.endsWith(".woff")) return "font/woff";
        if (name.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    // ------------------------------------------------------------------------------------------
    // Dosya seçici ("Dosya seç" düğmesi) ve JS iletişim kutuları
    // ------------------------------------------------------------------------------------------

    private final class AppChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null); // bekleyen varsa iptal et
            filePathCallback = callback;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE_CHOOSER);
            } catch (Exception e) {
                filePathCallback = null;
                callback.onReceiveValue(null);
                Toast.makeText(MainActivity.this, "Dosya seçici açılamadı.", Toast.LENGTH_SHORT).show();
                return false;
            }
            return true;
        }

        // confirm()/alert() varsayılan olarak sessizce reddedilir; "ekstreyi sil" gibi onaylar için gerekli
        @Override
        public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("Tamam", (d, w) -> result.confirm())
                    .setNegativeButton("Vazgeç", (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton("Tamam", (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.confirm())
                    .show();
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE_CHOOSER || filePathCallback == null) return;
        filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        filePathCallback = null; // callback mutlaka çağrılmalı; yoksa sonraki seçici açılmaz
    }

    // ------------------------------------------------------------------------------------------
    // "Paylaş → Ekstre Avukatı" ve "Birlikte aç"
    // ------------------------------------------------------------------------------------------

    @SuppressWarnings("deprecation")
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        List<Uri> uris = new ArrayList<>();

        if (Intent.ACTION_SEND.equals(action)) {
            Uri u = Build.VERSION.SDK_INT >= 33
                    ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class)
                    : (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = Build.VERSION.SDK_INT >= 33
                    ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class)
                    : intent.<Uri>getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            uris.add(intent.getData());
        }
        if (uris.isEmpty()) return;

        List<Shared> items = new ArrayList<>();
        for (Uri uri : uris) {
            Shared s = new Shared();
            s.uri = uri;
            s.type = getContentResolver().getType(uri);
            s.name = displayName(uri, s.type);
            synchronized (lock) {
                s.id = String.valueOf(++sharedCounter);
                sharedById.put(s.id, s);
            }
            items.add(s);
        }

        boolean ready;
        synchronized (lock) {
            ready = jsReady;
            if (!ready) pendingShares.addAll(items);
        }
        if (ready) pushToJs(items);
    }

    /** Web uygulaması yalnızca .pdf/.csv uzantılı dosya kabul eder; adı yoksa türünden uzantı üretir. */
    private String displayName(Uri uri, String type) {
        String name = null;
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) {
            // ad okunamazsa aşağıda üretilir
        }
        if (name == null || name.trim().isEmpty()) name = "ekstre";
        String lower = name.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".pdf") && !lower.endsWith(".csv")) {
            if (type != null && type.contains("pdf")) name += ".pdf";
            else if (type != null && (type.contains("csv") || type.contains("comma"))) name += ".csv";
        }
        return name;
    }

    private String toJson(List<Shared> items) {
        JSONArray arr = new JSONArray();
        try {
            for (Shared s : items) {
                JSONObject o = new JSONObject();
                o.put("name", s.name);
                o.put("type", s.type == null ? "" : s.type);
                o.put("url", "https://" + HOST + "/__shared/" + s.id);
                arr.put(o);
            }
        } catch (Exception ignored) {
            // JSON üretilemezse boş dizi gider
        }
        return arr.toString();
    }

    private void pushToJs(List<Shared> items) {
        final String quoted = JSONObject.quote(toJson(items));
        runOnUiThread(() -> web.evaluateJavascript("window.__eaShared && window.__eaShared(" + quoted + ")", null));
    }

    // ------------------------------------------------------------------------------------------
    // Web → Android köprüsü (yalnızca uygulamanın kendi sayfası bu nesneye erişir)
    // ------------------------------------------------------------------------------------------

    private final class Bridge {
        /** Uygulama açılırken bekleyen paylaşımları verir ve bundan sonrakilerin doğrudan itilmesini sağlar. */
        @JavascriptInterface
        public String pendingShares() {
            List<Shared> items;
            synchronized (lock) {
                jsReady = true;
                items = new ArrayList<>(pendingShares);
                pendingShares.clear();
            }
            return toJson(items);
        }

        /** CSV gibi dosyaları İndirilenler klasörüne yazar (WebView blob indirmeyi desteklemez). */
        @JavascriptInterface
        public boolean saveFile(String name, String mime, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safe = name.replaceAll("[^A-Za-z0-9._-]", "-");
                if (safe.length() > 80) safe = safe.substring(safe.length() - 80);
                if (safe.isEmpty()) safe = "ekstre-avukati.csv";

                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri out = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (out == null) throw new IOException("kayıt oluşturulamadı");
                    try (OutputStream os = getContentResolver().openOutputStream(out)) {
                        if (os == null) throw new IOException("yazılamadı");
                        os.write(bytes);
                    }
                    toast("İndirilenler klasörüne kaydedildi: " + safe);
                } else {
                    // Android 8-9: genel İndirilenler için izin gerekir; uygulamanın kendi alanına yazılır
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new IOException("depolama yok");
                    File f = new File(dir, safe);
                    try (FileOutputStream os = new FileOutputStream(f)) {
                        os.write(bytes);
                    }
                    toast("Kaydedildi: " + f.getAbsolutePath());
                }
                return true;
            } catch (Exception e) {
                toast("Dosya kaydedilemedi.");
                return false;
            }
        }

        /** Yüklü sürüm: {"code":2,"name":"1.1"} */
        @JavascriptInterface
        public String appVersion() {
            return updater.appVersion();
        }

        /** Ev ağındaki güncelleme sunucusuna sorar; yanıt __eaUpdateEvent ile gelir. */
        @JavascriptInterface
        public void checkUpdate(String baseUrl) {
            updater.check(baseUrl);
        }

        /** Yeni APK'yı indirir, doğrular ve Android kurulum onayını açar. */
        @JavascriptInterface
        public void installUpdate(String baseUrl) {
            updater.install(baseUrl);
        }

        /** Android yazdırma penceresi (PDF olarak kaydet dahil). Sayfanın yazdırma stili uygulanır. */
        @JavascriptInterface
        public void print(final String title) {
            runOnUiThread(() -> {
                try {
                    PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                    PrintDocumentAdapter adapter = web.createPrintDocumentAdapter(title);
                    pm.print(title, adapter, new PrintAttributes.Builder().build());
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Yazdırma açılamadı.", Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    private void toast(final String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }
}
