"use client";

import { Layers, X } from "lucide-react";
import { removeFromLibrary, setActiveId } from "@/lib/client/stores";
import { formatPeriod } from "@/lib/format";
import { ALL, statementLabel, type Scope } from "@/lib/statement/library";
import type { ParsedStatement } from "@/lib/statement/types";
import { cn } from "./ui";

/**
 * Üst bardaki ekstre hapları: tek tek ekstreler + (≥2 ise) "Tümü" birleşik/kıyas görünümü.
 * Dar ekranlarda yatay kaydırılır.
 */
export function StatementSwitcher({ library, scope }: { library: ParsedStatement[]; scope: Scope }) {
  const activeId = scope.combined ? ALL : scope.statements[0].id;

  return (
    <nav aria-label="Yüklü ekstreler" className="no-scrollbar -mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-0.5">
      {library.length >= 2 && (
        <Chip
          active={scope.combined}
          onSelect={() => setActiveId(ALL)}
          title="Tüm ekstreleri birleştir / kıyasla"
          label={`Tüm ekstreleri birleştir / kıyasla (${library.length})`}
        >
          <Layers className="size-3.5" />
          Tümü
          <span className="tabular rounded-full bg-current/15 px-1.5 text-[10px]">{library.length}</span>
        </Chip>
      )}
      {library.map((s) => {
        const dates = s.transactions.map((t) => t.date).sort();
        const period = dates.length ? formatPeriod(dates[0], dates[dates.length - 1]) : "";
        return (
          <Chip
            key={s.id}
            active={activeId === s.id}
            onSelect={() => s.id && setActiveId(s.id)}
            title={`${s.fileName}${period ? ` · ${period}` : ""}`}
            onRemove={() => {
              if (s.id && window.confirm(`"${s.fileName}" ekstresi bu tarayıcıdan silinsin mi?`)) removeFromLibrary(s.id);
            }}
            removeLabel={`${s.fileName} ekstresini sil`}
          >
            <span className="max-w-[5.5rem] truncate sm:max-w-36">{statementLabel(s)}</span>
            {period && <span className="tabular hidden text-[11px] opacity-60 lg:inline">{period}</span>}
          </Chip>
        );
      })}
    </nav>
  );
}

function Chip({
  active,
  onSelect,
  onRemove,
  removeLabel,
  title,
  label,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  title?: string;
  /** Görünen metin kısa olduğunda ekran okuyucu için açıklayıcı ad */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "group inline-flex shrink-0 items-center rounded-full text-[13px] font-semibold transition-all duration-200",
        active ? "bg-ink text-bg shadow-card" : "bg-surface-3/70 text-ink-2 hover:bg-surface-3 hover:text-ink",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={label}
        title={title}
        className={cn("inline-flex min-h-9 cursor-pointer items-center gap-1.5 py-1 pl-3.5", onRemove ? "pr-1" : "pr-3.5")}
      >
        {children}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="mr-1 grid size-6 cursor-pointer place-items-center rounded-full opacity-50 transition hover:bg-bad-fill/20 hover:text-bad hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
