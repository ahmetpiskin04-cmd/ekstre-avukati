import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { CATEGORIES } from "@/lib/statement/categories";
import type { CategoryId } from "@/lib/statement/types";
import { categoryColor } from "./category-colors";

export function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/** Yüzey: kenarsız, yumuşak katmanlı gölge ve geniş yuvarlak köşe ("soft UI"). */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("relative rounded-[28px] bg-surface shadow-card", className)}>{children}</div>;
}

/** Kategori kimliği: renkli nokta (veri görselleştirme paletiyle aynı renk) + yazılı etiket. */
export function CategoryDot({ category, className }: { category: CategoryId | "other"; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: categoryColor(category) }} />;
}

export function CategoryBadge({ category, className }: { category: CategoryId; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold text-ink-2", className)}
      style={{ background: `color-mix(in oklab, ${categoryColor(category)} 13%, transparent)` }}
    >
      <CategoryDot category={category} className="size-1.5" />
      {CATEGORIES[category].label}
    </span>
  );
}

/** İşyeri adının ilk harfiyle kategori renginde avatar. */
export function MerchantAvatar({ name, category, credit }: { name: string; category: CategoryId; credit?: boolean }) {
  const letter = name.trim().charAt(0).toLocaleUpperCase("tr-TR") || "?";
  const color = credit ? "var(--good)" : categoryColor(category);
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold"
      style={{ color, background: `color-mix(in oklab, ${color} 15%, transparent)` }}
    >
      {letter}
    </span>
  );
}

export function Pill({ tone = "neutral", icon, children }: { tone?: "neutral" | "good" | "warn" | "bad" | "accent"; icon?: ReactNode; children: ReactNode }) {
  const tones = {
    neutral: "bg-surface-3 text-ink-2",
    good: "bg-good/12 text-good",
    warn: "bg-warn-fill/15 text-warn",
    bad: "bg-bad-fill/12 text-bad",
    accent: "bg-accent-soft text-accent",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold", tones[tone])}>
      {icon}
      {children}
    </span>
  );
}

const tlParts = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tlWhole = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

/**
 * Para tutarı: tam kısım net ve büyük, kuruş (",48") ile "₺" bir ton soluk ve küçük.
 * Ekran okuyucuya tek parça okunur.
 */
export function Money({ value, className, decimals = true, sign }: { value: number; className?: string; decimals?: boolean; sign?: "+" | "-" }) {
  const abs = Math.abs(value);
  const neg = sign === "-" || (sign === undefined && value < 0);
  if (!decimals) {
    const whole = tlWhole.format(Math.round(abs));
    return (
      <span className={cn("tabular whitespace-nowrap", className)} aria-label={`${neg ? "eksi " : sign === "+" ? "artı " : ""}${whole} lira`}>
        {neg ? "−" : sign === "+" ? "+" : ""}
        {whole}
        <span className="ml-0.5 text-[0.7em] font-medium opacity-55">₺</span>
      </span>
    );
  }
  const [whole, frac] = tlParts.format(abs).split(",");
  return (
    <span className={cn("tabular whitespace-nowrap", className)} aria-label={`${neg ? "eksi " : sign === "+" ? "artı " : ""}${whole},${frac} lira`}>
      <span aria-hidden>
        {neg ? "−" : sign === "+" ? "+" : ""}
        {whole}
        <span className="text-[0.72em] font-medium opacity-50">,{frac}</span>
        <span className="ml-0.5 text-[0.62em] font-medium opacity-50">₺</span>
      </span>
    </span>
  );
}

/**
 * Önceki aya göre değişim etiketi. Harcamada artış kötü (mercan), azalış iyi (zümrüt).
 * Yön ok ikonuyla da verilir; renk tek başına anlam taşımaz.
 */
export function TrendChip({ pct, label, title }: { pct: number | null | undefined; label?: string; title?: string }) {
  if (pct === undefined) return null;
  const isNew = pct === null;
  const up = !isNew && pct > 0.05;
  const down = !isNew && pct < -0.05;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const tone = isNew ? "bg-warn-fill/15 text-warn" : up ? "bg-bad-fill/12 text-bad" : down ? "bg-good/12 text-good" : "bg-surface-3 text-muted";
  const text = isNew ? "yeni" : `%${Math.abs(pct).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
  return (
    <span title={title} className={cn("tabular inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", tone)}>
      {!isNew && <Icon className="size-3" aria-hidden />}
      <span className="sr-only">{isNew ? "" : up ? "artış" : down ? "azalış" : "değişim yok"}</span>
      {text}
      {label && <span className="ml-1 font-normal opacity-75">{label}</span>}
    </span>
  );
}

export function SectionTitle({ icon, title, sub, right }: { icon?: ReactNode; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="flex items-start gap-2.5">
        {icon && <span className="grid size-9 place-items-center rounded-2xl bg-surface-3 text-ink-2">{icon}</span>}
        <div>
          <h3 className="text-[15px] font-bold tracking-tight text-ink">{title}</h3>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent">{icon}</div>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}
