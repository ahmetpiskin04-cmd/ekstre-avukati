import type { CategoryId } from "./types";

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  /** Rozet için Tailwind sınıfları (açık + koyu tema) */
  badge: string;
}

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  market: { id: "market", label: "Market", badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25" },
  restoran: { id: "restoran", label: "Yeme-İçme", badge: "bg-orange-500/12 text-orange-700 dark:text-orange-300 ring-orange-500/25" },
  ulasim: { id: "ulasim", label: "Ulaşım & Yakıt", badge: "bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25" },
  dijital: { id: "dijital", label: "Abonelik", badge: "bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25" },
  fatura: { id: "fatura", label: "Faturalar", badge: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 ring-cyan-500/25" },
  alisveris: { id: "alisveris", label: "Alışveriş", badge: "bg-pink-500/12 text-pink-700 dark:text-pink-300 ring-pink-500/25" },
  giyim: { id: "giyim", label: "Giyim", badge: "bg-rose-400/12 text-rose-600 dark:text-rose-300 ring-rose-400/25" },
  saglik: { id: "saglik", label: "Sağlık", badge: "bg-teal-500/12 text-teal-700 dark:text-teal-300 ring-teal-500/25" },
  eglence: { id: "eglence", label: "Eğlence", badge: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-500/25" },
  egitim: { id: "egitim", label: "Eğitim", badge: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 ring-indigo-500/25" },
  banka: { id: "banka", label: "Banka Kesintisi", badge: "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25" },
  nakit: { id: "nakit", label: "Nakit & Transfer", badge: "bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25" },
  diger: { id: "diger", label: "Diğer", badge: "bg-slate-500/12 text-slate-700 dark:text-slate-300 ring-slate-500/25" },
};

/** Türkçe karakterleri sadeleştirip büyük harfe çevirir: "Çağrı" -> "CAGRI" */
export function normalizeTr(s: string): string {
  return s
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/Â/g, "A");
}

/** Banka kesintisi anahtar kelimeleri (normalize edilmiş). */
export const BANK_FEE_KEYWORDS = [
  "YILLIK KART",
  "KART UCRETI",
  "KART AIDATI",
  "UYELIK UCRETI",
  "HESAP ISLETIM",
  "HESAP BAKIM",
  "EFT UCRETI",
  "HAVALE UCRETI",
  "FAST UCRETI",
  "BSMV",
  "KKDF",
  "GECIKME FAIZI",
  "AKDI FAIZ",
  "NAKIT AVANS FAIZI",
  "NAKIT AVANS UCRETI",
  "SMS BILGILENDIRME",
  "SMS UCRETI",
  "EKSTRE UCRETI",
  "KOMISYON",
  "MASRAF",
  "ISLEM UCRETI",
];

/** Kredi/iade/ödeme olduğunu gösteren kelimeler. */
export const CREDIT_KEYWORDS = [
  "ODEMENIZ ICIN TESEKKUR",
  "ODEME - TESEKKUR",
  "KART ODEMESI",
  "BORC ODEME",
  "IADE",
  "MAAS",
  "GELEN EFT",
  "GELEN HAVALE",
  "GELEN FAST",
  "PUAN KAZANIM",
  "IPTAL",
];

const RULES: Array<[CategoryId, string[]]> = [
  ["banka", BANK_FEE_KEYWORDS],
  ["dijital", ["NETFLIX", "SPOTIFY", "YOUTUBE", "DISNEY", "AMAZON PRIME", "PRIMEVIDEO", "BLUTV", "EXXEN", "GAIN", "TOD ", "APPLE.COM", "ICLOUD", "GOOGLE ONE", "GOOGLE *", "MICROSOFT", "XBOX", "PLAYSTATION", "STEAM", "CHATGPT", "OPENAI", "ADOBE", "CANVA", "DUOLINGO", "STORYTEL", "AUDIBLE", "MUBI", "TABII"]],
  ["fatura", ["TURKCELL", "VODAFONE", "TURK TELEKOM", "TT MOBIL", "SUPERONLINE", "TURKNET", "ENERJISA", "CK ENERJI", "IGDAS", "ISKI", "ASKI", "BASKENTGAZ", "ELEKTRIK", "DOGALGAZ", "SU IDARESI", "FATURA"]],
  ["market", ["MIGROS", "A101", "BIM ", "BIM BIRLESIK", "SOK MARKET", "SOK ", "CARREFOUR", "MACROCENTER", "FILE MARKET", "METRO GROSS", "GETIR", "ISTEGELSIN", "HAPPY CENTER", "ONUR MARKET", "MARKET", "BAKKAL", "MANAV", "KASAP", "FIRIN"]],
  ["restoran", ["YEMEKSEPETI", "TRENDYOL YEMEK", "STARBUCKS", "KAHVE DUNYASI", "BURGER KING", "MCDONALD", "DOMINOS", "PIZZA", "KFC", "POPEYES", "SIMIT SARAYI", "TAVUK DUNYASI", "BIG CHEFS", "CAFE", "KAFE", "RESTORAN", "RESTAURANT", "LOKANTA", "KEBAP", "DONER", "BURGER", "COFFEE", "ESPRESSOLAB", "PASTANE"]],
  ["ulasim", ["SHELL", "OPET", "BP ", "PETROL OFISI", "TOTAL", "AYTEMIZ", "AKARYAKIT", "ISTANBULKART", "BELBIM", "UBER", "BITAKSI", "MARTI", " TAKSI ", "OTOPARK", "ISPARK", " HGS ", " OGS ", "PEGASUS", "THY", "TURK HAVA", "AJET", "OBILET", "METRO TURIZM", "KAMIL KOC", "TCDD", "BINBIN"]],
  ["alisveris", ["TRENDYOL", "HEPSIBURADA", "AMAZON", "N11", "CICEKSEPETI", "TEMU", "SHEIN", "IKEA", "KOCTAS", "TEKNOSA", "MEDIAMARKT", "VATAN BILGISAYAR", "WATSONS", "GRATIS", "ROSSMANN", "DECATHLON"]],
  ["giyim", ["ZARA", "H&M", "LC WAIKIKI", "LCW", "KOTON", "DEFACTO", "MAVI ", "BOYNER", "FLO ", "BERSHKA", "PULL&BEAR", "MANGO", "COLINS", "NETWORK", "VAKKO", "SKECHERS", "NIKE", "ADIDAS", "GIYIM", "TEKSTIL"]],
  ["saglik", ["ECZANE", "ECZA", "HASTANE", "SAGLIK", "KLINIK", "DIS HEKIMI", "LABORATUVAR", "OPTIK", "ACIBADEM", "MEDICAL PARK", "MEMORIAL"]],
  ["eglence", ["SINEMA", "CINEMAXIMUM", "PARIBU CINEVERSE", "BILETIX", "PASSO", "BILETINIAL", "TIYATRO", "KONSER", "SPOR SALONU", "MACFIT", "GYM", "BOWLING"]],
  ["egitim", ["UDEMY", "COURSERA", "KITAP", "D&R", "IDEFIX", "KIRTASIYE", "UNIVERSITE", "KURS", "OKUL"]],
  ["nakit", ["ATM", "NAKIT CEKIM", "NAKIT AVANS", "EFT", "HAVALE", "FAST", "PAPARA", "ININAL", "PARA TRANSFERI"]],
];

/**
 * Normalize metinde anahtar kelime arar. Kısa anahtarlar (≤4 harf: BIM, SOK,
 * ATM, EFT, UBER...) yalnızca kelime başında eşleşir; yoksa "BELBIM" içindeki
 * "BIM" market, "TAKSIT" içindeki "TAKSI" ulaşım sanılıyordu. Uzun anahtarlar
 * kelime içinde de eşleşir ("SUPERMARKET" → MARKET).
 */
export function hasKeyword(normalized: string, key: string): boolean {
  const k = key.trim();
  if (k.length > 4) return normalized.includes(key);
  let from = 0;
  for (;;) {
    const i = normalized.indexOf(k, from);
    if (i === -1) return false;
    const before = i === 0 ? " " : normalized[i - 1];
    const after = normalized[i + k.length] ?? " ";
    const trailingOk = key.endsWith(" ") ? !/[A-Z0-9]/.test(after) : true;
    if (!/[A-Z0-9]/.test(before) && trailingOk) return true;
    from = i + 1;
  }
}

export function categorize(description: string): CategoryId {
  const n = ` ${normalizeTr(description)} `;
  for (const [cat, keywords] of RULES) {
    if (keywords.some((k) => hasKeyword(n, k))) return cat;
  }
  return "diger";
}

export function isBankFee(description: string): boolean {
  const n = normalizeTr(description);
  return BANK_FEE_KEYWORDS.some((k) => hasKeyword(n, k));
}

export function looksLikeCredit(description: string): boolean {
  const n = normalizeTr(description);
  return CREDIT_KEYWORDS.some((k) => hasKeyword(n, k));
}
