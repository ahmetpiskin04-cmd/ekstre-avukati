export type CategoryId =
  | "market"
  | "restoran"
  | "ulasim"
  | "dijital"
  | "fatura"
  | "alisveris"
  | "giyim"
  | "saglik"
  | "eglence"
  | "egitim"
  | "banka"
  | "nakit"
  | "diger";

/** Harcama: tutar > 0. İade/ödeme/gelir: kind = "credit", toplam harcamaya girmez. */
export type TransactionKind = "debit" | "credit";

export interface Transaction {
  id: string;
  /** ISO tarih (YYYY-AA-GG) */
  date: string;
  /** Ekstredeki maskelenmiş ham açıklama */
  description: string;
  /** Temizlenmiş işyeri adı (ör. "NETFLIX.COM ISTANBUL TR" -> "Netflix") */
  merchant: string;
  category: CategoryId;
  /** Her zaman pozitif TL tutarı */
  amount: number;
  kind: TransactionKind;
  /** Banka kesintisi mi (aidat, BSMV, faiz...) */
  isBankFee: boolean;
  /** İşyeri adı/kategori yapay zekâ ile düzeltildi mi */
  aiEnriched?: boolean;
}

export interface MaskReport {
  cards: number;
  ibans: number;
  nationalIds: number;
}

export interface ParsedStatement {
  /** Kütüphanede kaydedilirken atanır (çoklu ekstre yönetimi) */
  id?: string;
  fileName: string;
  fileType: "pdf" | "csv";
  uploadedAt: string;
  /** Maskelenmiş ilk satırlar (önizleme için) */
  previewLines: string[];
  totalLines: number;
  maskReport: MaskReport;
  transactions: Transaction[];
  warnings: string[];
  isDemo?: boolean;
  /** "vision": taranmış PDF, satırlar Gemini ile okundu */
  source?: "text" | "vision";
  visionModel?: string;
  /**
   * PDF'te okunabilir işlem yok; Gemini görsel okuma için kullanıcı onayı bekleniyor.
   * Bu durumda dönen nesne kaydedilmez.
   */
  needsVision?: boolean;
  /** @deprecated v1 kaydı: analizler artık ayrı depoda (analyses) tutulur; yalnızca taşıma için okunur. */
  analysis?: AiAnalysis;
}

/* ------------------------------------------------------------------ */
/* Yapay zekâ analizi (/api/analyze-statement)                         */
/* ------------------------------------------------------------------ */

export type FindingType = "gizli-abonelik" | "banka-masrafi" | "faiz" | "harcama-artisi" | "cakisan-abonelik" | "fiyat-artisi" | "diger";
export type AdviceKind = "itiraz" | "iptal" | "pazarlik" | "aliskanlik";
export type AdvicePriority = "yuksek" | "orta" | "dusuk";

export interface MerchantFix {
  /** Maskelenmiş ham açıklama (eşleştirme anahtarı) */
  description: string;
  merchant: string;
  category: CategoryId;
}

export interface AiFinding {
  type: FindingType;
  title: string;
  detail: string;
  /** İlgili TL tutarı (yoksa null) */
  amount: number | null;
}

export interface AiAdvice {
  title: string;
  /** Kullanıcının atacağı somut adımlar */
  action: string;
  /** Dayanak/not (ör. Tüketici Hakem Heyeti); yoksa null */
  legalNote: string | null;
  /** Bu maddenin dayandığı kodla hesaplanmış tasarruf anahtarları (ör. "fee:aidat", "overlap:video") */
  savingKeys: string[];
  /**
   * Yıllık tasarruf (TL). Gemini'nin yazdığı sayı DEĞİL: savingKeys'teki, önceki
   * maddelerde sayılmamış kalemlerin kodla hesaplanmış toplamı (aynı kesinti iki kez sayılmaz).
   */
  annualSaving: number | null;
  priority: AdvicePriority;
  kind: AdviceKind;
}

export interface AiAnalysis {
  model: string;
  createdAt: string;
  summary: string;
  findings: AiFinding[];
  advice: AiAdvice[];
  /** Adı veya kategorisi değişen işlem sayısı */
  changedTransactions: number;
  /** Tekilleştirilmiş toplam yıllık tasarruf (TL) */
  totalAnnualSaving?: number;
}

export interface AnalyzeResponse {
  model: string;
  summary: string;
  findings: AiFinding[];
  advice: AiAdvice[];
  merchantFixes: MerchantFix[];
  totalAnnualSaving: number;
}

/* ------------------------------------------------------------------ */
/* Sohbet (/api/chat-statement)                                        */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  model?: string;
  error?: boolean;
}

export interface ChatResponse {
  reply: string;
  model: string;
}
