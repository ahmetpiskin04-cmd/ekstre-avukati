"use client";

import { ArrowUp, CalendarDays, Check, Copy, Eraser, Lock, Percent, Repeat, RotateCcw, Scale, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { askStatement } from "@/lib/client/api";
import { formatPeriod, formatTLShort } from "@/lib/format";
import type { StatementSummary } from "@/lib/statement/analyze";
import type { ChatMessage, Transaction } from "@/lib/statement/types";
import { Card, cn } from "../ui";

const SUGGESTIONS: Array<{ text: string; icon: ReactNode }> = [
  { text: "Bu ay en çok hangi gün ve nerede para harcadım?", icon: <CalendarDays className="size-3.5" /> },
  { text: "Hafta sonu harcamalarım hafta içine göre yüzde kaç fazla?", icon: <Percent className="size-3.5" /> },
  { text: "Tüm aboneliklerimin yıllık maliyeti ne kadar?", icon: <Repeat className="size-3.5" /> },
  { text: "Hangi banka kesintilerine itiraz edebilirim?", icon: <Scale className="size-3.5" /> },
];

/** Sohbet geçmişi yalnızca bu sekmenin oturumunda (sessionStorage) tutulur. */
const historyKey = (scopeKey: string) => `ekstre-avukati:chat:${scopeKey}`;

function loadHistory(scopeKey: string): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(historyKey(scopeKey));
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(scopeKey: string, messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(historyKey(scopeKey), JSON.stringify(messages.slice(-40)));
  } catch {
    /* gizli pencere vb.: yalnızca bellekte kalır */
  }
}

export function ChatTab({ summary, scopeKey, transactions, combined }: { summary: StatementSummary; scopeKey: string; transactions: Transaction[]; combined: boolean }) {
  // ChatTab yalnızca istemcide (ekstre yüklendikten sonra) çizilir; ilk değer sessionStorage'dan okunabilir.
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(scopeKey));
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveHistory(scopeKey, messages);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, scopeKey]);

  async function send(text: string, base: ChatMessage[] = messages) {
    const q = text.trim();
    if (!q || pending) return;
    const next: ChatMessage[] = [...base, { role: "user", text: q }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await askStatement(next, transactions);
      setMessages((m) => [...m, { role: "assistant", text: res.reply, model: res.model }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: e instanceof Error ? e.message : "Yanıt alınamadı.", error: true }]);
    } finally {
      setPending(false);
    }
  }

  /** Hatalı yanıtı silip son soruyu yeniden sorar. */
  function retry() {
    const lastUser = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUser === -1) return;
    const idx = messages.length - 1 - lastUser;
    void send(messages[idx].text, messages.slice(0, idx));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  const period = formatPeriod(summary.periodStart, summary.periodEnd);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="flex h-[640px] min-w-0 flex-col overflow-hidden lg:col-span-2">
        {/* Copilot başlığı */}
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="relative grid size-8 place-items-center rounded-full bg-accent-soft text-accent">
              <Sparkles className="size-4" />
              <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-brand ring-2 ring-surface" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight text-ink">Ekstre Copilot</p>
              <p className="text-[11px] text-muted">Yalnızca {combined ? "yüklü ekstrelerdeki" : "bu ekstredeki"} verilerle yanıtlar · Gemini</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              disabled={pending}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            >
              <Eraser className="size-3.5" />
              Temizle
            </button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-lg flex-col items-center pt-6 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
                <Sparkles className="size-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink">Ekstrene bir soru sor</h3>
              <p className="mt-1 text-sm text-muted">
                {transactions.length} işlem · toplam {formatTLShort(summary.totalSpending)} · {summary.subscriptions.length} tekrarlayan ödeme ·{" "}
                {summary.fees.length} tür banka kesintisi
              </p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    onClick={() => void send(s.text)}
                    disabled={pending}
                    className="group flex cursor-pointer items-start gap-2.5 rounded-2xl bg-surface-2 p-4 text-left text-sm text-ink-2 transition-colors duration-150 hover:border-brand/40 hover:bg-brand/[0.06] hover:text-ink disabled:opacity-50"
                  >
                    <span className="mt-0.5 text-muted transition-colors group-hover:text-accent">{s.icon}</span>
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === "user" ? (
                <UserMessage key={i} text={m.text} />
              ) : (
                <AnswerCard key={i} message={m} onRetry={m.error && i === messages.length - 1 ? retry : undefined} />
              ),
            )
          )}
          {pending && <Thinking />}
        </div>

        {/* Giriş alanı */}
        <div className="border-t border-line p-3">
          {messages.length > 0 && (
            <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => void send(s.text)}
                  disabled={pending}
                  className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 text-xs text-ink-2 transition-colors hover:border-brand/40 hover:text-ink disabled:opacity-50"
                >
                  <span className="text-muted">{s.icon}</span>
                  {s.text}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={onSubmit} className="flex items-center gap-2 rounded-full border border-line bg-surface-2/60 p-1.5 pl-3.5 transition-colors focus-within:border-brand/50 focus-within:bg-surface">
            <label className="flex-1">
              <span className="sr-only">Mesajınız</span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={1000}
                placeholder="Ekstrene bir soru sor…"
                className="h-9 w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={!input.trim() || pending}
              aria-label="Gönder"
              className="grid size-9 cursor-pointer place-items-center rounded-full bg-ink text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          </form>
          <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted">
            <Lock className="size-3" />
            Sorunuz da gönderilmeden önce maskelenir; kart no, IBAN ve kimlik numarası asla paylaşılmaz.
          </p>
        </div>
      </Card>

      <Card className="h-fit p-5">
        <p className="text-[13px] font-semibold text-ink-2">Sohbet bağlamı</p>
        <dl className="mt-3 space-y-2.5 text-sm">
          {[
            ["Kapsam", combined ? "Tüm ekstreler (birleşik)" : "Seçili ekstre"],
            ["Dönem", period || "—"],
            ["İşlem", String(transactions.length)],
            ["Toplam harcama", formatTLShort(summary.totalSpending)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="tabular truncate font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="my-4 h-px bg-line" />
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Lock className="size-4 text-accent" />
          Yapay zekâya ne gidiyor?
        </p>
        <ul className="mt-3 space-y-2 text-sm text-ink-2">
          <ContextRow ok>Maskelenmiş işlem listesi ({transactions.length} satır): tarih, işyeri, kategori, tutar</ContextRow>
          <ContextRow ok>Kodla hesaplanmış özet: aylık/günlük toplamlar, abonelikler, kesintiler</ContextRow>
          <ContextRow ok>Sorunuz (o da gönderilmeden önce maskelenir)</ContextRow>
          <ContextRow>
            Kart numarası, IBAN, T.C. Kimlik No — <strong className="text-ink">asla</strong>
          </ContextRow>
        </ul>
        <p className="mt-4 rounded-2xl bg-surface-2 p-4 text-xs text-muted">
          API anahtarı yalnızca sunucuda durur; tarayıcı Gemini&apos;ye doğrudan bağlanmaz. Sohbet geçmişi yalnızca bu sekme açıkken tutulur.
        </p>
      </Card>
    </div>
  );
}

function ContextRow({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", ok ? "bg-brand" : "bg-bad-fill")} />
      <span>{children}</span>
    </li>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[80%] rounded-2xl rounded-br-md border border-brand/25 bg-brand/12 px-3.5 py-2 text-sm leading-relaxed text-ink">{text}</p>
    </div>
  );
}

/** Yapay zekâ yanıtı: yapılandırılmış kart (başlık + model rozeti + biçimli gövde + kopyala). */
function AnswerCard({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (message.error) {
    return (
      <div className="animate-fade-up rounded-2xl bg-bad-fill/10 p-3.5 text-sm text-bad">
        <p>{message.text}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold underline underline-offset-2">
            <RotateCcw className="size-3" />
            Tekrar dene
          </button>
        )}
      </div>
    );
  }
  return (
    <article className="animate-fade-up overflow-hidden rounded-3xl bg-surface-2" title={message.model ? `Model: ${message.model}` : undefined}>
      <header className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
          <Sparkles className="size-3.5 text-accent" />
          Ekstre Avukatı
          {message.model && <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-muted">{message.model}</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(message.text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          aria-label="Yanıtı kopyala"
          className="grid size-7 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
        </button>
      </header>
      <div className="px-3.5 py-3 text-sm leading-relaxed text-ink">
        <RichText text={message.text} />
      </div>
    </article>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-xs text-muted" aria-label="Yanıt yazılıyor">
      <Sparkles className="size-3.5 animate-pulse text-accent" />
      Ekstre inceleniyor
      <span className="inline-flex gap-1">
        <span className="size-1 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted" />
      </span>
    </div>
  );
}

/** Asistan yanıtları için küçük biçimlendirici: "- " maddeleri ve **kalın**. HTML enjekte edilmez. */
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="my-1.5 space-y-1">
        {list.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-brand" />
            <span>{inline(l)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`} className="my-1">{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/** **kalın** parçalar vurgulanır; rakam içerenler zümrüt ve eş aralıklı rakamla. */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const inner = part.slice(2, -2);
      return (
        <strong key={i} className={cn("tabular font-semibold", /\d/.test(inner) ? "text-accent" : "text-ink")}>
          {inner}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
