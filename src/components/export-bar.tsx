"use client";

import { FileSpreadsheet, Printer } from "lucide-react";
import { textToBase64 } from "@/lib/base64";
import { nativeBridge } from "@/lib/client/native";
import { buildCsv, CSV_BOM, reportFileName, type ReportData } from "@/lib/statement/report";

function downloadCsv(data: ReportData) {
  const bridge = nativeBridge();
  if (bridge) {
    // WebView blob: indirmelerini desteklemez; dosyayı yerel kod İndirilenler'e yazar.
    bridge.saveFile(`${reportFileName(data.scopeLabel, data.generatedAt)}.csv`, "text/csv", textToBase64(CSV_BOM + buildCsv(data)));
    return;
  }
  const blob = new Blob([CSV_BOM + buildCsv(data)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${reportFileName(data.scopeLabel, data.generatedAt)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Analiz, abonelik listesi ve tavsiyeleri dışa aktarma (CSV / yazdırılabilir rapor). */
export function ExportBar({ data }: { data: ReportData }) {
  const btn =
    "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-surface px-4 text-xs font-semibold text-ink-2 shadow-card transition-colors duration-150 hover:border-line-strong hover:text-ink";
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Raporu dışa aktar (analiz, abonelikler ve tavsiyeler)">
      <button type="button" onClick={() => downloadCsv(data)} className={btn}>
        <FileSpreadsheet className="size-4 text-accent" />
        CSV indir (Excel)
      </button>
      <button
        type="button"
        onClick={() => {
          const bridge = nativeBridge();
          if (bridge) bridge.print(`Ekstre Avukatı raporu ${data.generatedAt}`);
          else window.print();
        }}
        className={btn}
      >
        <Printer className="size-4 text-accent" />
        Yazdırılabilir rapor
      </button>
    </div>
  );
}
