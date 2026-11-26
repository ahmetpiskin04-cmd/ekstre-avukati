import { EyeOff, HardDrive, Lock, ShieldCheck } from "lucide-react";
import type { MaskReport } from "@/lib/statement/types";
import { cn } from "./ui";

const totalOf = (r?: MaskReport | null) => (r ? r.cards + r.ibans + r.nationalIds : 0);

/** Üst bardaki maskeleme durumu rozeti: "X hassas veri yerel olarak maskelendi". */
export function PrivacyPill({ report }: { report?: MaskReport | null }) {
  const total = totalOf(report);
  const text = report ? (total ? `${total} hassas veri yerel olarak maskelendi` : "Maskelenecek hassas veri yok") : "Yerel maskeleme açık";
  return (
    <span
      title={
        report
          ? `Kart no: ${report.cards} · IBAN: ${report.ibans} · T.C. Kimlik No: ${report.nationalIds} — yapay zekâya gönderilmeden önce maskelendi`
          : "Kart numarası, IBAN ve T.C. Kimlik No yapay zekâya gönderilmeden önce maskelenir"
      }
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-xs font-semibold text-accent"
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      <span className="tabular hidden md:inline">{text}</span>
      <span className="tabular md:hidden" aria-label={text}>
        {report ? total : <Lock className="size-3" />}
      </span>
    </span>
  );
}

/** Yükleme alanının yanındaki güven kartı */
export function PrivacyBadge({ report, className }: { report?: MaskReport | null; className?: string }) {
  const total = totalOf(report);
  return (
    <div className={cn("relative overflow-hidden rounded-[28px] bg-surface p-5 shadow-card", className)}>
      <div className="relative flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-snug tracking-tight text-ink">
            Kart numaranız ve IBAN bilgileriniz AI&apos;ya gönderilmeden önce yerel olarak maskelenir
          </p>
          <ul className="mt-2.5 space-y-1.5 text-xs text-ink-2">
            <li className="flex gap-2">
              <EyeOff className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <span>
                Kart no → <code className="tabular whitespace-nowrap rounded bg-surface-2 px-1 font-mono text-[11px]">**** **** **** 1234</code>, IBAN ve T.C. Kimlik No →{" "}
                <code className="whitespace-nowrap rounded bg-surface-2 px-1 font-mono text-[11px]">[GİZLİ_VERİ]</code>
              </span>
            </li>
            <li className="flex gap-2">
              <HardDrive className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <span>Dosya diske yazılmaz; sonuçlar yalnızca bu tarayıcıda saklanır.</span>
            </li>
          </ul>
          {report && (
            <p className="mt-2.5 text-xs font-medium text-accent">
              {total === 0
                ? "Bu ekstrede maskelenecek hassas veri bulunmadı."
                : `Bu ekstrede ${[
                    report.cards && `${report.cards} kart numarası`,
                    report.ibans && `${report.ibans} IBAN`,
                    report.nationalIds && `${report.nationalIds} T.C. Kimlik No`,
                  ]
                    .filter(Boolean)
                    .join(", ")} maskelendi.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
