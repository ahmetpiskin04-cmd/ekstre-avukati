import { formatDate, formatSignedPct, formatTL, formatYM } from "@/lib/format";
import { SERVICE_GROUP_LABEL } from "@/lib/statement/analyze";
import { CATEGORIES } from "@/lib/statement/categories";
import type { ReportData } from "@/lib/statement/report";
import { adviceTotal } from "@/lib/statement/savings";

const MAX_PRINT_TX = 150;

/**
 * Yazdırılabilir Özet Rapor. Ekranda gizli, yalnızca yazdırırken (Ctrl+P / "PDF olarak
 * kaydet") görünür; uygulamanın geri kalanı yazdırmada gizlenir. Tema renklerinden
 * bağımsız, her zaman açık zemin üzerinde siyah metin.
 */
export function PrintReport({ data }: { data: ReportData }) {
  const { summary: s, comparison: c, analysis } = data;
  const th = "border-b border-gray-400 px-2 py-1 text-left font-semibold";
  const td = "border-b border-gray-200 px-2 py-1 align-top";
  const num = "tabular text-right whitespace-nowrap";
  const h2 = "mt-6 mb-2 text-base font-bold break-after-avoid";
  const budgetByCat = new Map(data.budgets.map((b) => [b.category, b]));
  const shownTx = data.transactions.slice(0, MAX_PRINT_TX);

  return (
    <article id="print-report" className="hidden bg-white p-0 text-[11px] leading-snug text-black print:block">
      <header className="border-b-2 border-black pb-2">
        <h1 className="text-xl font-bold">Ekstre Avukatı — Özet Rapor</h1>
        <p className="mt-1 text-gray-700">
          {data.scopeLabel} · Dönem: {s.periodStart ? formatDate(s.periodStart) : "?"} – {s.periodEnd ? formatDate(s.periodEnd) : "?"} · Oluşturulma: {formatDate(data.generatedAt)}
        </p>
        <p className="text-gray-600">Kart numarası, IBAN ve T.C. Kimlik No maskelenmiştir.</p>
      </header>

      <h2 className={h2}>Özet</h2>
      <table className="w-full border-collapse">
        <tbody>
          {[
            ["Toplam harcama", formatTL(s.totalSpending)],
            ["Aylık ortalama", formatTL(s.monthlyAverage)],
            ["İşlem sayısı", String(s.transactionCount)],
            ["Aylık abonelik yükü", formatTL(s.monthlySubscriptionCost)],
            ["Banka kesintisi (dönem)", formatTL(s.feeTotal)],
            ["Tasarruf potansiyeli (yıllık)", formatTL(s.savings.total)],
            ...(analysis ? [["Tavsiyelerle tekilleştirilmiş tasarruf (yıllık)", formatTL(adviceTotal(analysis))]] : []),
          ].map(([k, v]) => (
            <tr key={k}>
              <td className={td}>{k}</td>
              <td className={`${td} ${num} font-semibold`}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {c && (
        <>
          <h2 className={h2}>
            Önceki aya göre değişim ({formatYM(c.previousMonth)} → {formatYM(c.currentMonth)})
          </h2>
          <p>
            {formatTL(c.previousTotal)} → {formatTL(c.currentTotal)} ({c.changePct === null ? "—" : formatSignedPct(c.changePct)}).
          </p>
          {c.topIncreases.length > 0 && (
            <p className="mt-1">
              En çok artan: {c.topIncreases.map((i) => `${CATEGORIES[i.category].label} +${formatTL(i.change)}`).join(", ")}.
            </p>
          )}
          {c.newSubscriptions.length > 0 && <p className="mt-1">Yeni abonelik: {c.newSubscriptions.map((x) => `${x.merchant} (${formatTL(x.monthlyAmount)}/ay)`).join(", ")}.</p>}
        </>
      )}

      <h2 className={h2}>Kategoriler{data.budgetMonth ? ` ve ${formatYM(data.budgetMonth)} bütçe durumu` : ""}</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Kategori</th>
            <th className={`${th} ${num}`}>Toplam</th>
            <th className={`${th} ${num}`}>Pay</th>
            <th className={`${th} ${num}`}>Aylık limit</th>
            <th className={`${th} ${num}`}>Kullanım</th>
          </tr>
        </thead>
        <tbody>
          {s.categories.map((cat) => {
            const b = budgetByCat.get(cat.category);
            return (
              <tr key={cat.category}>
                <td className={td}>{CATEGORIES[cat.category].label}</td>
                <td className={`${td} ${num}`}>{formatTL(cat.total)}</td>
                <td className={`${td} ${num}`}>%{Math.round(cat.share * 100)}</td>
                <td className={`${td} ${num}`}>{b ? formatTL(b.limit) : "—"}</td>
                <td className={`${td} ${num}`}>{b ? `%${Math.round(b.ratio * 100)}${b.level === "over" ? " (aşıldı)" : b.level === "warn" ? " (uyarı)" : ""}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className={h2}>Abonelikler</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Abonelik</th>
            <th className={`${th} ${num}`}>Aylık</th>
            <th className={`${th} ${num}`}>Yıllık</th>
            <th className={th}>Not</th>
          </tr>
        </thead>
        <tbody>
          {s.subscriptions.map((sub) => (
            <tr key={sub.merchant}>
              <td className={td}>{sub.merchant}</td>
              <td className={`${td} ${num}`}>{formatTL(sub.monthlyAmount)}</td>
              <td className={`${td} ${num}`}>{formatTL(sub.annualCost)}</td>
              <td className={td}>
                {[sub.priceIncrease ? `zam +${formatTL(sub.priceIncrease)}` : "", sub.overlapsWith.length && sub.serviceGroup ? `${SERVICE_GROUP_LABEL[sub.serviceGroup]} türünde çakışma: ${sub.overlapsWith.join(", ")}` : ""]
                  .filter(Boolean)
                  .join("; ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className={h2}>Banka kesintileri</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Tür</th>
            <th className={`${th} ${num}`}>Dönem toplamı</th>
            <th className={`${th} ${num}`}>Adet</th>
            <th className={`${th} ${num}`}>Yıllık karşılık</th>
          </tr>
        </thead>
        <tbody>
          {s.fees.map((f) => (
            <tr key={f.type}>
              <td className={td}>{f.label}</td>
              <td className={`${td} ${num}`}>{formatTL(f.total)}</td>
              <td className={`${td} ${num}`}>{f.count}</td>
              <td className={`${td} ${num}`}>{formatTL(f.annualized)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {analysis && (
        <>
          <h2 className={h2}>Ekstre Avukatı Tavsiyesi &amp; İtiraz/İptal Rehberi</h2>
          <p className="mb-2">{analysis.summary}</p>
          <ol className="list-decimal space-y-2 pl-5">
            {analysis.advice.map((a, i) => (
              <li key={i} className="break-inside-avoid">
                <strong>{a.title}</strong>
                {a.annualSaving ? ` — yıllık ${formatTL(a.annualSaving)}` : ""}
                <br />
                {a.action}
                {a.legalNote && (
                  <>
                    <br />
                    <em>Dayanak: {a.legalNote}</em>
                  </>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-gray-600">Yapay zekâ ({analysis.model}) önerisidir; hukuki danışmanlık yerine geçmez.</p>
        </>
      )}

      <h2 className={`${h2} break-before-page`}>İşlemler</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Tarih</th>
            <th className={th}>İşyeri</th>
            <th className={th}>Kategori</th>
            <th className={`${th} ${num}`}>Tutar</th>
          </tr>
        </thead>
        <tbody>
          {shownTx.map((t) => (
            <tr key={t.id} className="break-inside-avoid">
              <td className={`${td} whitespace-nowrap`}>{t.date}</td>
              <td className={td}>{t.merchant}</td>
              <td className={td}>{t.kind === "credit" ? "Ödeme/iade" : CATEGORIES[t.category].label}</td>
              <td className={`${td} ${num}`}>
                {t.kind === "credit" ? "+" : ""}
                {formatTL(t.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.transactions.length > shownTx.length && <p className="mt-1 text-gray-600">… {data.transactions.length - shownTx.length} işlem daha (tamamı için CSV dışa aktarımını kullanın).</p>}
    </article>
  );
}
