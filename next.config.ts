import type { NextConfig } from "next";

/**
 * STANDALONE=1 → telefon (APK) derlemesi: sunucusuz statik dışa aktarım. Bu modda
 *  - "@engine" yerel motora (engine-local.ts) gider; API rotaları derlemeden önce
 *    scripts/build-android-web.mjs tarafından geçici olarak devre dışı bırakılır,
 *  - server-only koruması (src/lib/server-guard.ts) boş modüle yönlendirilir (kod artık cihazda çalışır).
 * Normal web derlemesi hiçbir şeyi değiştirmez.
 */
const standalone = process.env.STANDALONE === "1";

const nextConfig: NextConfig = {
  // Statik dışa aktarım (telefon) önbellekli bileşenler/PPR ile birlikte kullanılamaz; sunucu da yok.
  ...(standalone
    ? { output: "export" as const, distDir: "out-android", images: { unoptimized: true }, env: { NEXT_PUBLIC_STANDALONE: "1" } }
    : { cacheComponents: true, partialPrefetching: true }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    resolveAlias: {
      "@engine": standalone ? "./src/lib/client/engine-local.ts" : "./src/lib/client/engine-remote.ts",
      ...(standalone ? { "@/lib/server-guard": "./src/lib/client/empty.ts" } : {}),
    },
  },
};

export default nextConfig;
