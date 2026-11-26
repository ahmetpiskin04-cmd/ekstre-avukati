"use client";

import {
  ChevronDown,
  Download,
  Layers,
  Plus,
  FileSpreadsheet,
  FileText,
  FileUp,
  LoaderCircle,
  ScanText,
  Sparkles,
  Trash,
  TriangleExclamationPoint,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { runAnalysis, useAnalysisStatus } from "@/lib/client/analysis-store";
import { uploadStatement } from "@/lib/client/api";
import { subscribeShared } from "@/lib/client/shared-files";
import { addToLibrary, clearLibrary, useAnalyses } from "@/lib/client/stores";
import { formatPeriod } from "@/lib/format";
import { readStoredKey, STANDALONE } from "@/lib/gemini-key";
import type { Scope } from "@/lib/statement/library";
import type { ParsedStatement } from "@/lib/statement/types";
import { PrivacyBadge } from "./privacy-badge";
import { Card, cn, Pill } from "./ui";

const MAX_BYTES = 10 * 1024 * 1024;

export function UploadPanel({ scope, count }: { scope: Scope | null; count: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<null | "file" | "demo" | "vision">(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  /** Taranmış PDF: görsel okuma için kullanıcı onayı bekleyen dosya */
  const [pending, setPending] = useState<{ file: File; reason: string } | null>(null);

  async function handle(file: File, opts: { demo?: boolean; vision?: boolean } = {}) {
    setError(null);
    if (!opts.demo && !/\.(pdf|csv)$/i.test(file.name)) {
      setError("Yalnızca .pdf veya .csv uzantılı ekstreler desteklenir.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Dosya 10 MB sınırını aşıyor.");
      return;
    }
    setBusy(opts.vision ? "vision" : opts.demo ? "demo" : "file");
    try {
      const result = await uploadStatement(file, opts);
      if (result.needsVision) {
        setPending({ file, reason: result.warnings[0] ?? "PDF'ten işlem okunamadı." });
        return;
      }
      setPending(null);
      const id = addToLibrary(result);
      setShowPreview(true);
      // Yeni ekstrenin kendi analizi (işyeri adları + tavsiyeler) otomatik başlar.
      // Telefonda anahtar yoksa başlatma (hata yerine, anahtar girilince Dashboard başlatır).
      if (!STANDALONE || readStoredKey()) {
        void runAnalysis({ key: id, combined: false, statements: [{ ...result, id }], transactions: result.transactions });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme başarısız.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // "Paylaş → Ekstre Avukatı" ile gelen dosyalar normal yükleme akışından geçer
  // (taranmış PDF ise yine önce onay sorulur).
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  });
  useEffect(
    () =>
      subscribeShared((files) => {
        void (async () => {
          for (const f of files) await handleRef.current(f);
        })();
      }),
    [],
  );

  async function tryDemo() {
    setError(null);
    setBusy("demo");
    try {
      const res = await fetch("/ornek-ekstre.csv", { cache: "no-store" });
      const blob = await res.blob();
      await handle(new File([blob], "ornek-ekstre.csv", { type: "text/csv" }), { demo: true });
    } catch {
      setError("Örnek ekstre yüklenemedi.");
      setBusy(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handle(file);
  }

  return (
    <section aria-label="Ekstre yükleme" className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Card
        className={cn("min-w-0 p-5 lg:col-span-3", dragging && scope && "border-accent bg-accent-soft")}
        {...(scope
          ? {
              onDragOver: (e: DragEvent) => {
                e.preventDefault();
                setDragging(true);
              },
              onDragLeave: () => setDragging(false),
              onDrop,
            }
          : {})}
      >
        {pending ? (
          <VisionConsent
            fileName={pending.file.name}
            reason={pending.reason}
            busy={busy === "vision"}
            onAccept={() => void handle(pending.file, { vision: true })}
            onCancel={() => setPending(null)}
          />
        ) : scope ? (
          <LoadedFile scope={scope} count={count} onAdd={() => inputRef.current?.click()} showPreview={showPreview} setShowPreview={setShowPreview} busy={busy !== null} />
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-[24px] border-2 border-dashed px-6 py-10 text-center transition-colors duration-200",
              dragging ? "border-brand bg-brand/[0.07]" : "border-line-strong bg-surface-2/40 hover:border-brand/40",
            )}
          >
            <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-56 -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
            <div className={cn("relative grid size-14 place-items-center rounded-full bg-accent-soft text-accent transition-transform duration-500 [transition-timing-function:var(--ease-spring)]", dragging ? "scale-125" : "animate-bob")}>
              {busy === "file" ? <LoaderCircle className="size-6 animate-spin" /> : <FileUp className="size-6" />}
            </div>
            <div>
              <p className="font-semibold text-ink">{busy === "file" ? "Ekstre okunuyor ve maskeleniyor…" : "Ekstrenizi buraya sürükleyin"}</p>
              <p className="mt-1 text-sm text-muted">PDF (taranmış dahil) veya CSV · en fazla 10 MB · kredi kartı veya banka hesap dökümü</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => inputRef.current?.click()}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg shadow-card transition hover:brightness-110 disabled:opacity-60"
              >
                <FileUp className="size-4" />
                Dosya seç
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={tryDemo}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand/50 hover:text-accent disabled:opacity-60"
              >
                {busy === "demo" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Örnek Ekstre ile Dene
              </button>
            </div>
            {/* Telefonda (WebView) "download" bağlantıları çalışmaz; orada "Örnek Ekstre ile Dene" yeterli. */}
            {!STANDALONE && (
              <p className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted">
                <Download className="size-3" />
                Örnek dosyayı indirip kendiniz yükleyin:
                <a href="/ornek-ekstre.csv" download className="underline-offset-2 hover:text-accent hover:underline">CSV</a>
                <a href="/ornek-ekstre.pdf" download className="underline-offset-2 hover:text-accent hover:underline">PDF</a>
                <a href="/ornek-ekstre-eylul.csv" download className="underline-offset-2 hover:text-accent hover:underline">Eylül</a>
                <a href="/ornek-ekstre-ekim.csv" download className="underline-offset-2 hover:text-accent hover:underline">Ekim</a>
              </p>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.csv,application/pdf,text/csv"
          className="sr-only"
          aria-label="Ekstre dosyası seç"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handle(f);
          }}
        />
        {error && (
          <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-bad-fill/10 px-3 py-2 text-sm text-bad">
            <TriangleExclamationPoint className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </Card>

      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        <PrivacyBadge report={scope ? sumMasks(scope.statements) : null} />
        {scope && (
          <button
            type="button"
            onClick={() => {
              if (count > 1 && !window.confirm(`${count} ekstrenin tümü bu tarayıcıdan silinsin mi?`)) return;
              clearLibrary();
              setShowPreview(false);
            }}
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 self-start rounded-full bg-surface px-4 text-xs font-semibold text-muted shadow-card transition-colors hover:border-bad-fill/40 hover:text-bad"
          >
            <Trash className="size-3.5" />
            {count > 1 ? "Tüm ekstreleri sil" : "Tarayıcıdaki verileri sil"}
          </button>
        )}
      </div>
    </section>
  );
}

function VisionConsent({ fileName, reason, busy, onAccept, onCancel }: { fileName: string; reason: string; busy: boolean; onAccept: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-warn-fill/12 text-warn">
          <ScanText className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{fileName}</p>
          <p className="text-sm text-muted">{reason}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-warn-fill/10 p-4 text-sm text-ink-2">
        <p className="font-semibold text-ink">Yapay zekâ ile görüntüden okunsun mu?</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          <li>Taranmış sayfalarda maskelenecek metin olmadığı için PDF&apos;in kendisi Google Gemini&apos;ye gönderilir.</li>
          <li>Gemini&apos;ye kart no, IBAN ve kimlik numarasını yazmaması söylenir; çıkardığı metin kaydedilmeden önce yine maskeleme filtresinden geçer.</li>
          <li>Dosya bu sunucuda saklanmaz. Okunan tutarları ekstrenizle karşılaştırmanız önerilir.</li>
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-bg shadow-card transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ? "Gemini okuyor… (30-90 sn)" : "Onaylıyorum, yapay zekâ ile oku"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition hover:text-ink disabled:opacity-60"
        >
          <X className="size-4" />
          Vazgeç
        </button>
      </div>
    </div>
  );
}

function AiStatusLine({ scope }: { scope: Scope }) {
  const status = useAnalysisStatus(scope.key);
  const analysis = useAnalyses()[scope.key];
  if (status.state === "running") {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs font-medium text-accent">
        <LoaderCircle className="size-3.5 animate-spin" />
        Ekstre Avukatı inceliyor: işyeri adları, gizli masraflar ve tavsiyeler hazırlanıyor…
      </p>
    );
  }
  if (status.state === "error") {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-bad-fill/10 px-3 py-2 text-xs text-bad">
        <TriangleExclamationPoint className="size-3.5 shrink-0" />
        Yapay zekâ analizi yapılamadı: {status.message}
        <button type="button" onClick={() => void runAnalysis(scope, { force: true })} className="font-semibold underline underline-offset-2">
          Tekrar dene
        </button>
      </p>
    );
  }
  if (analysis) {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Sparkles className="size-3.5 text-accent" />
        <span>
          Yapay zekâ analizi hazır · {analysis.changedTransactions} işlemin adı/kategorisi düzeltildi · <span className="font-mono">{analysis.model}</span>
        </span>
        <button type="button" onClick={() => void runAnalysis(scope, { force: true })} className="font-medium text-accent hover:underline">
          Yeniden analiz et
        </button>
      </p>
    );
  }
  return null;
}

function sumMasks(statements: ParsedStatement[]) {
  return statements.reduce(
    (a, s) => ({ cards: a.cards + s.maskReport.cards, ibans: a.ibans + s.maskReport.ibans, nationalIds: a.nationalIds + s.maskReport.nationalIds }),
    { cards: 0, ibans: 0, nationalIds: 0 },
  );
}

function LoadedFile({
  scope,
  count,
  onAdd,
  showPreview,
  setShowPreview,
  busy,
}: {
  scope: Scope;
  count: number;
  onAdd: () => void;
  showPreview: boolean;
  setShowPreview: (v: boolean) => void;
  busy: boolean;
}) {
  const statement = scope.statements[0];
  const dates = scope.transactions.map((t) => t.date).sort();
  const Icon = scope.combined ? Layers : statement.fileType === "pdf" ? FileText : FileSpreadsheet;
  const warnings = scope.statements.flatMap((s) => s.warnings);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
              <span className="truncate">{scope.combined ? "Tüm ekstreler (birleşik görünüm)" : statement.fileName}</span>
              {!scope.combined && statement.isDemo && <Pill tone="warn">Örnek veri</Pill>}
              {!scope.combined && statement.source === "vision" && (
                <Pill tone="accent" icon={<ScanText className="size-3" />}>
                  Görüntüden okundu
                </Pill>
              )}
            </p>
            <p className="text-sm text-muted">
              {scope.combined ? `${count} ekstre` : statement.fileType.toUpperCase()} · {scope.transactions.length} işlem
              {dates.length > 0 && ` · ${formatPeriod(dates[0], dates[dates.length - 1])}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={busy}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-brand/50 hover:text-accent disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Ekstre ekle
        </button>
      </div>
      {count === 1 && <p className="mt-2 text-xs text-muted">Başka bir ayın ekstresini ekleyerek aylar arası değişimi ve birleşik görünümü açabilirsiniz.</p>}

      <AiStatusLine scope={scope} />

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1">
          {[...new Set(warnings)].map((w) => (
            <li key={w} className="flex items-start gap-2 rounded-lg bg-warn-fill/10 px-3 py-2 text-xs text-warn">
              <TriangleExclamationPoint className="mt-0.5 size-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}

      {!scope.combined && (
        <>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            aria-expanded={showPreview}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent"
          >
            <ChevronDown className={cn("size-4 transition-transform", showPreview && "rotate-180")} />
            Maskelenmiş ham metin önizlemesi ({statement.totalLines} satır)
          </button>
          {showPreview && (
            <div className="mt-2 max-h-72 overflow-auto rounded-2xl bg-surface-2 p-4 font-mono text-[12px] leading-relaxed text-ink-2">
              {statement.previewLines.map((line, i) => (
                <div key={i} className="whitespace-pre">
                  <span className="mr-3 inline-block w-6 select-none text-right text-muted/60">{i + 1}</span>
                  <MaskedLine line={line} />
                </div>
              ))}
              {statement.totalLines > statement.previewLines.length && (
                <div className="mt-1 text-muted">… {statement.totalLines - statement.previewLines.length} satır daha</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const MASK_TOKEN = /(\*{4} \*{4} \*{4} \d{4}|\[GİZLİ_VERİ\])/;

function MaskedLine({ line }: { line: string }) {
  return (
    <>
      {line.split(MASK_TOKEN).map((part, i) =>
        MASK_TOKEN.test(part) ? (
          <mark key={i} className="rounded bg-accent-soft px-1 font-semibold text-accent">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
