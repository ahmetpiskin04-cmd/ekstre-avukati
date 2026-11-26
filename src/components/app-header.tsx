import { Scale } from "lucide-react";
import type { Scope } from "@/lib/statement/library";
import type { MaskReport, ParsedStatement } from "@/lib/statement/types";
import { SettingsButton } from "./gemini-key";
import { PrivacyPill } from "./privacy-badge";
import { StatementSwitcher } from "./statement-switcher";
import { ThemeToggle } from "./theme-toggle";

/** Yüzen hap biçimli üst bar: logo · ekstre hapları · maskeleme rozeti · tema. */
export function AppHeader({ library, scope, maskReport }: { library: ParsedStatement[]; scope: Scope | null; maskReport: MaskReport | null }) {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6 sm:pt-4 print:hidden">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 rounded-full bg-surface/85 pl-2 pr-2 shadow-lift backdrop-blur-xl sm:pl-2.5">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white">
            <Scale className="size-[18px]" aria-hidden />
          </span>
          <span className="hidden text-[15px] font-bold tracking-tight text-ink sm:inline">Ekstre Avukatı</span>
        </div>

        <span aria-hidden className="hidden h-6 w-px bg-line-strong sm:block" />

        <div className="min-w-0 flex-1">{scope && <StatementSwitcher library={library} scope={scope} />}</div>

        <div className="flex shrink-0 items-center gap-1.5">
          <PrivacyPill report={maskReport} />
          <SettingsButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
