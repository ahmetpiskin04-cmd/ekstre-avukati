"use client";

import { Gavel, Landmark, Layers, Lightbulb, Repeat, RotateCw, TrendingUp } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { formatDay, formatTL, formatTLShort } from "@/lib/format";
import { SERVICE_GROUP_LABEL, type FeeGroup, type StatementSummary, type Subscription } from "@/lib/statement/analyze";
import type { Scope } from "@/lib/statement/library";
import { AdvicePanel } from "../advice-panel";
import { Card, CategoryBadge, cn, EmptyState, MerchantAvatar, Money, Pill } from "../ui";

const DISPUTABLE = new Set(["aidat", "hesap", "sms", "diger"]);

export function SubscriptionsTab({ summary, scope }: { summary: StatementSummary; scope: Scope }) {
  const { subscriptions, fees } = summary;
  const feeAnnual = fees.reduce((s, f) => s + f.annualized, 0);

  return (
    <div className="space-y-6">
      <AdvicePanel scope={scope} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="Aylık abonelik yükü" value={formatTL(summary.monthlySubscriptionCost)} />
        <Mini label="Yıllık abonelik yükü" value={formatTLShort(summary.monthlySubscriptionCost * 12)} />
        <Mini label="Dönemdeki banka kesintisi" value={formatTL(summary.feeTotal)} tone="bad" />
        <Mini label="Kesintilerin yıllık karşılığı" value={formatTLShort(feeAnnual)} tone="bad" />
      </div>

      <section>
        <SectionHead icon={<Repeat className="size-4" />} title="Tekrarlayan ödemeler" sub="Her ay benzer tutarda tekrar eden ödemeler ve dijital servisler" />
        {subscriptions.length === 0 ? (
          <Card>
            <EmptyState icon={<Repeat className="size-6" />} title="Tekrarlayan ödeme bulunamadı">
              Birden fazla aylık ekstre yüklediğinizde abonelikler daha güvenilir tespit edilir.
            </EmptyState>
          </Card>
        ) : (
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {subscriptions.map((s, i) => (
              <SubscriptionCard key={s.merchant} s={s} index={i} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHead icon={<Landmark className="size-4" />} title="Banka kesintileri" sub="Aidat, faiz, vergi ve işlem ücretleri — çoğu itiraz edilebilir veya önlenebilir" />
        {fees.length === 0 ? (
          <Card>
            <EmptyState icon={<Landmark className="size-6" />} title="Banka kesintisi bulunamadı">
              Bu ekstrede aidat, faiz veya komisyon kalemi görünmüyor.
            </EmptyState>
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {fees.map((f) => (
              <FeeRow key={f.type} f={f} />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[13px] font-semibold text-ink-2">{label}</p>
      <p className={`tabular mt-1 text-lg font-semibold ${tone === "bad" ? "text-bad" : "text-ink"}`}>{value}</p>
    </Card>
  );
}

function SectionHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="mt-0.5 grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">{icon}</span>
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="text-xs text-muted">{sub}</p>
      </div>
    </div>
  );
}

/** Kategoriye göre genel iptal/tasarruf ipucu (kesin iddia değil, yönlendirme). */
function cancelTip(s: Subscription): string {
  if (s.category === "dijital") return "İptal için uygulama mağazası (Google Play / App Store) → Abonelikler menüsünü ya da servisin hesap ayarlarını kullanın.";
  if (s.category === "fatura") return "Operatörünüzü arayıp güncel kampanyalı tarifeye geçmeyi veya taahhüt indirimini isteyin.";
  if (s.category === "eglence") return "Üyelik sözleşmenizdeki iptal/dondurma koşullarını kontrol edin; kullanmadığınız aylarda dondurabilirsiniz.";
  return "Bu ödemeyi hâlâ kullanıp kullanmadığınızı gözden geçirin; gerekmiyorsa hizmet sağlayıcıdan iptal edin.";
}

/** Tıklayınca dönen abonelik kartı: ön yüz özet, arka yüz yıllık maliyet ve ipucu. */
function SubscriptionCard({ s, index }: { s: Subscription; index: number }) {
  const [flipped, setFlipped] = useState(false);
  const toggle = () => setFlipped((f) => !f);
  const face = "flex flex-col gap-3 rounded-[28px] bg-surface p-5 shadow-card";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${s.merchant} aboneliği: ${flipped ? "özete dön" : "ayrıntıları göster"}`}
      data-flipped={flipped}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      style={{ "--i": index } as CSSProperties}
      className="flip lift group cursor-pointer rounded-[28px] text-left outline-offset-4"
    >
      <div className="flip-inner">
        {/* Ön yüz */}
        <div className={face} aria-hidden={flipped}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <MerchantAvatar name={s.merchant} category={s.category} />
              <div className="min-w-0">
                <p className="truncate font-bold text-ink">{s.merchant}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <CategoryBadge category={s.category} />
                  {s.confidence === "olasi" && <Pill>Olası abonelik</Pill>}
                </div>
              </div>
            </div>
            <div className="text-right">
              <Money value={s.monthlyAmount} className="text-lg font-bold text-ink" />
              <p className="text-[11px] text-muted">/ ay</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-3.5 py-2.5 text-xs">
            <span className="text-muted">
              {s.months} ayda {s.occurrences} ödeme · son {formatDay(s.lastDate)}
            </span>
            <span className="tabular font-bold text-ink">{formatTLShort(s.annualCost)}/yıl</span>
          </div>
          {(s.priceIncrease || s.overlapsWith.length > 0) && (
            <div className="flex flex-col gap-1.5">
              {s.priceIncrease && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-warn">
                  <TrendingUp className="size-3.5 shrink-0" />
                  Zam yapıldı: {formatTL(s.firstAmount)} → {formatTL(s.monthlyAmount)} (+{formatTL(s.priceIncrease)})
                </p>
              )}
              {s.overlapsWith.length > 0 && s.serviceGroup && (
                <p className="flex items-start gap-1.5 text-xs font-medium text-bad">
                  <Layers className="mt-0.5 size-3.5 shrink-0" />
                  Çakışma: {s.overlapsWith.join(", ")} ile aynı türde ({SERVICE_GROUP_LABEL[s.serviceGroup].toLocaleLowerCase("tr-TR")}).
                </p>
              )}
            </div>
          )}
          <p className="mt-auto flex items-center gap-1 text-[11px] font-medium text-muted opacity-70 transition-opacity group-hover:opacity-100">
            <RotateCw className="size-3 transition-transform duration-500 group-hover:rotate-180" />
            Ayrıntı için dokunun
          </p>
        </div>

        {/* Arka yüz */}
        <div className={cn(face, "flip-back hero-card")} aria-hidden={!flipped}>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-bold text-ink">{s.merchant}</p>
            <span className="rounded-full bg-surface/70 px-2.5 py-1 text-[11px] font-semibold text-ink-2">Yıllık etki</span>
          </div>
          <div>
            <Money value={s.annualCost} className="text-3xl font-extrabold tracking-tight text-ink" />
            <p className="mt-1 text-xs text-ink-2">
              aylık {formatTL(s.monthlyAmount)} × 12 · ilk ödeme {formatDay(s.firstDate)}
            </p>
          </div>
          <p className="flex items-start gap-1.5 rounded-2xl bg-surface/70 p-3 text-xs leading-relaxed text-ink-2">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warn" />
            {cancelTip(s)}
          </p>
          <p className="mt-auto flex items-center gap-1 text-[11px] font-medium text-muted">
            <RotateCw className="size-3" />
            Geri çevirmek için dokunun
          </p>
        </div>
      </div>
    </div>
  );
}

function FeeRow({ f }: { f: FeeGroup }) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{f.label}</p>
          {DISPUTABLE.has(f.type) && (
            <Pill tone="accent" icon={<Gavel className="size-3" />}>
              İtiraz edilebilir
            </Pill>
          )}
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-2">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warn" />
          {f.tip}
        </p>
        <p className="mt-1 truncate text-[11px] text-muted">
          {f.transactions.map((t) => `${formatDay(t.date)} ${formatTL(t.amount)}`).join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 gap-6 text-right sm:block sm:space-y-0.5">
        <p className="tabular font-semibold text-bad">{formatTL(f.total)}</p>
        <p className="tabular text-xs text-muted">
          {f.count} kez · yıllık ≈ {formatTLShort(f.annualized)}
        </p>
      </div>
    </div>
  );
}
