import { hasKeyword, normalizeTr } from "./categories";

/** Bilinen işyerleri için okunaklı ad. Anahtar normalize edilmiş metinde aranır. */
const KNOWN: Array<[string, string]> = [
  ["NETFLIX", "Netflix"],
  ["SPOTIFY", "Spotify"],
  ["YOUTUBE", "YouTube Premium"],
  ["DISNEY", "Disney+"],
  ["PRIMEVIDEO", "Amazon Prime Video"],
  ["AMAZON PRIME", "Amazon Prime"],
  ["BLUTV", "BluTV"],
  ["EXXEN", "Exxen"],
  ["APPLE.COM", "Apple (iCloud/App Store)"],
  ["ICLOUD", "Apple iCloud"],
  ["GOOGLE ONE", "Google One"],
  ["CHATGPT", "ChatGPT Plus"],
  ["OPENAI", "OpenAI"],
  ["ADOBE", "Adobe"],
  ["DUOLINGO", "Duolingo"],
  ["STORYTEL", "Storytel"],
  ["XBOX", "Xbox Game Pass"],
  ["PLAYSTATION", "PlayStation"],
  ["STEAM", "Steam"],
  ["MACFIT", "MACFit"],
  ["TURKCELL", "Turkcell"],
  ["VODAFONE", "Vodafone"],
  ["TURK TELEKOM", "Türk Telekom"],
  ["SUPERONLINE", "Superonline"],
  ["TURKNET", "TurkNet"],
  ["ENERJISA", "Enerjisa"],
  ["IGDAS", "İGDAŞ"],
  ["ISKI", "İSKİ"],
  ["MIGROS", "Migros"],
  ["A101", "A101"],
  ["BIM BIRLESIK", "BİM"],
  ["SOK MARKET", "ŞOK Market"],
  ["CARREFOUR", "CarrefourSA"],
  ["MACROCENTER", "Macrocenter"],
  ["GETIR", "Getir"],
  ["YEMEKSEPETI", "Yemeksepeti"],
  ["TRENDYOL YEMEK", "Trendyol Yemek"],
  ["TRENDYOL", "Trendyol"],
  ["HEPSIBURADA", "Hepsiburada"],
  ["AMAZON", "Amazon"],
  ["STARBUCKS", "Starbucks"],
  ["KAHVE DUNYASI", "Kahve Dünyası"],
  ["ESPRESSOLAB", "Espressolab"],
  ["BURGER KING", "Burger King"],
  ["MCDONALD", "McDonald's"],
  ["DOMINOS", "Domino's Pizza"],
  ["SIMIT SARAYI", "Simit Sarayı"],
  ["SHELL", "Shell"],
  ["OPET", "Opet"],
  ["PETROL OFISI", "Petrol Ofisi"],
  ["ISTANBULKART", "İstanbulkart"],
  ["BELBIM", "İstanbulkart"],
  ["BITAKSI", "BiTaksi"],
  ["UBER", "Uber"],
  ["MARTI", "Martı"],
  ["ISPARK", "İSPARK"],
  ["PEGASUS", "Pegasus"],
  ["TURK HAVA", "Türk Hava Yolları"],
  ["ZARA", "Zara"],
  ["LC WAIKIKI", "LC Waikiki"],
  ["IKEA", "IKEA"],
  ["TEKNOSA", "Teknosa"],
  ["MEDIAMARKT", "MediaMarkt"],
  ["WATSONS", "Watsons"],
  ["GRATIS", "Gratis"],
  ["CINEMAXIMUM", "Cinemaximum"],
  ["BILETIX", "Biletix"],
  ["UDEMY", "Udemy"],
  ["D&R", "D&R"],
  ["ECZANE", "Eczane"],
];

/** Ödeme aracısı önekleri: "IYZICO*TRENDYOL" -> "TRENDYOL" */
const PROCESSOR_PREFIX = /^(?:IYZICO|IYZ|PAYTR|PARAM|PAYU|SIPAY|PAPARA|MOKA|ODEAL|GOOGLE|APPLE\.COM\/BILL|PP|PAYPAL)\s*\*\s*/i;

/** Sondaki şehir/ülke ve terminal kodları */
const TAIL_NOISE = [
  /\s+(?:TR|TUR|TURKEY|TURKIYE|TÜRKİYE|IE|NL|LU|GB|US|IRL)$/i,
  /\s+(?:ISTANBUL|İSTANBUL|ANKARA|IZMIR|İZMİR|BURSA|ANTALYA|KOCAELI|KOCAELİ|ESKISEHIR|ESKİŞEHİR|KADIKOY|KADIKÖY|BESIKTAS|BEŞİKTAŞ|SISLI|ŞİŞLİ|UMRANIYE|ÜMRANİYE|ATASEHIR|ATAŞEHİR|MASLAK|AMSTERDAM|DUBLIN|LUXEMBOURG|LONDON)$/i,
  /\s+\d{3,}$/, // terminal / şube no
  /\s+(?:[A-Z]{1,3}\d+|\d+[A-Z]{1,3})$/i, // "SUBE12", "T45" gibi kodlar
];

function titleCaseTr(s: string): string {
  // Bankalar çoğunlukla ASCII büyük harf yazar: "ALI" Ali'dir, "Alı" değil.
  // Metinde Türkçe harf varsa (İ, Ş, Ğ...) Türkçe kurallarla küçültürüz.
  const hasTurkish = /[İıŞşĞğÜüÖöÇç]/.test(s);
  const lower = hasTurkish ? s.toLocaleLowerCase("tr-TR") : s.toLowerCase();
  const upperFirst = (w: string) => (hasTurkish ? w.charAt(0).toLocaleUpperCase("tr-TR") : w.charAt(0).toUpperCase()) + w.slice(1);
  return lower
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(normalizeTr(w)) ? w.toLocaleUpperCase("tr-TR") : upperFirst(w)))
    .join(" ");
}

const ACRONYMS = new Set(["ATM", "EFT", "FAST", "BSMV", "KKDF", "SMS", "AVM", "PTT", "THY", "BP", "HGS", "OGS", "GIB", "SGK", "LCW", "TL"]);

/** Kural sözlüğündeki bilinen marka adı (ör. "DISNEYPLUS AMSTERDAM" → "Disney+"); yoksa null. */
export function knownMerchant(description: string): string | null {
  const norm = normalizeTr(description);
  for (const [key, name] of KNOWN) {
    if (hasKeyword(norm, key)) return name;
  }
  return null;
}

export function cleanMerchant(description: string): string {
  const known = knownMerchant(description);
  if (known) return known;

  let s = description.trim();
  s = s.replace(PROCESSOR_PREFIX, "");
  s = s.replace(/\[GİZLİ_VERİ\]|\*{4} \*{4} \*{4} \d{4}/g, "");
  s = s.replace(/\bKART\s+NO\b|\bALICI\s*$/gi, "");
  s = s.replace(/\b(?:WWW\.)?([A-Z0-9-]+)\.(?:COM|NET|ORG|COM\.TR)(?:\.TR)?\b/gi, "$1");
  s = s.replace(/[*#]+/g, " ").replace(/\s{2,}/g, " ").trim();

  // Sondaki gürültüyü birkaç tur temizle ("MIGROS SUBE123 ISTANBUL TR")
  for (let i = 0; i < 4; i++) {
    const before = s;
    for (const re of TAIL_NOISE) s = s.replace(re, "").trim();
    if (s === before) break;
  }

  if (!s) return description.trim() || "Bilinmeyen işyeri";
  return titleCaseTr(s);
}
