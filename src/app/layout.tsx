import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { PwaBoot } from "@/components/pwa-boot";
import "./globals.css";

// Yuvarlak hatlı, sıcak ve okunaklı arayüz yazı tipi (Türkçe karakterler için latin-ext)
const sans = Plus_Jakarta_Sans({ variable: "--font-sans-ui", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "Ekstre Avukatı — Harcama ve abonelik analizi",
  description:
    "Kredi kartı ve banka ekstrelerinizi yükleyin; gizli abonelikleri, gereksiz banka kesintilerini ve tasarruf fırsatlarını yakalayın. Hassas veriler yerel olarak maskelenir.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Ekstre", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ed" },
    { media: "(prefers-color-scheme: dark)", color: "#131217" },
  ],
};

// İlk boyamadan önce temayı uygular (beyaz parlama olmasın).
const themeScript = `(function(){try{var t=localStorage.getItem("ea-theme");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" suppressHydrationWarning className={`${sans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <PwaBoot />
      </body>
    </html>
  );
}
