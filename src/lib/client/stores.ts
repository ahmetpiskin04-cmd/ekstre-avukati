"use client";

import { useSyncExternalStore } from "react";
import { sanitizeBudgets, type Budgets } from "@/lib/statement/budget";
import { ALL, addStatement, migrateLegacy, pruneAnalyses, removeStatement } from "@/lib/statement/library";
import type { CategoryId } from "@/lib/statement/types";
import type { AiAnalysis, ParsedStatement } from "@/lib/statement/types";

/**
 * Tarayıcı içi kalıcı depolama. Finansal veri hiçbir dış veritabanına gitmez;
 * yalnızca bu tarayıcının localStorage'ında (maskelenmiş haliyle) durur.
 * localStorage kapalıysa (gizli pencere vb.) oturum boyunca bellekte tutulur.
 */

function createStore<T>(key: string, fallback: T, parse: (raw: unknown) => T) {
  const listeners = new Set<() => void>();
  let memory: T | undefined;
  let useMemory = false;
  let cachedRaw: string | null | undefined;
  let cached: T = fallback;

  function get(): T {
    if (typeof window === "undefined") return fallback;
    if (useMemory) return memory as T;
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return memory ?? fallback;
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        cached = raw ? parse(JSON.parse(raw)) : fallback;
      } catch {
        cached = fallback;
      }
    }
    return cached;
  }

  const emit = () => listeners.forEach((l) => l());

  function set(value: T) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      useMemory = false;
    } catch {
      useMemory = true;
      memory = value;
    }
    emit();
  }

  function subscribe(cb: () => void) {
    listeners.add(cb);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) cb();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", onStorage);
    };
  }

  function remove() {
    memory = undefined;
    useMemory = false;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* yok say */
    }
    emit();
  }

  return { get, set, remove, use: () => useSyncExternalStore(subscribe, get, () => fallback) };
}

const NO_STATEMENTS: ParsedStatement[] = [];
const NO_ANALYSES: Record<string, AiAnalysis> = {};
const NO_BUDGETS: Budgets = {};

const statementsStore = createStore<ParsedStatement[]>("ekstre-avukati:statements:v2", NO_STATEMENTS, (raw) =>
  Array.isArray(raw) ? (raw as ParsedStatement[]).filter((s) => s && typeof s.id === "string" && Array.isArray(s.transactions)) : NO_STATEMENTS,
);
const viewStore = createStore<string | null>("ekstre-avukati:view:v1", null, (raw) => (typeof raw === "string" ? raw : null));
const analysesStore = createStore<Record<string, AiAnalysis>>("ekstre-avukati:analyses:v1", NO_ANALYSES, (raw) =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, AiAnalysis>) : NO_ANALYSES,
);
const budgetsStore = createStore<Budgets>("ekstre-avukati:budgets:v1", NO_BUDGETS, sanitizeBudgets);

export const useLibrary = statementsStore.use;
export const useActiveId = viewStore.use;
export const useAnalyses = analysesStore.use;
export const useBudgets = budgetsStore.use;

/** Yeni ekstre ekler (aynı dosya adı varsa yerine geçer) ve onu aktif görünüm yapar. */
export function addToLibrary(s: ParsedStatement): string {
  const { lib, id } = addStatement(statementsStore.get(), s);
  statementsStore.set(lib);
  analysesStore.set(pruneAnalyses(analysesStore.get(), lib));
  viewStore.set(id);
  return id;
}

export function removeFromLibrary(id: string) {
  const lib = removeStatement(statementsStore.get(), id);
  if (lib.length === 0) {
    statementsStore.remove();
    analysesStore.remove();
    viewStore.remove();
    return;
  }
  statementsStore.set(lib);
  analysesStore.set(pruneAnalyses(analysesStore.get(), lib));
  if (viewStore.get() === id || (viewStore.get() === ALL && lib.length < 2)) viewStore.set(lib[lib.length - 1].id ?? null);
}

export function clearLibrary() {
  statementsStore.remove();
  analysesStore.remove();
  viewStore.remove();
}

export const setActiveId = (id: string) => viewStore.set(id);

/** Belirtilen ekstrelerin işlemlerini günceller (ör. yapay zekâ işyeri düzeltmeleri). */
export function mapStatements(ids: string[], update: (s: ParsedStatement) => ParsedStatement) {
  const set = new Set(ids);
  statementsStore.set(statementsStore.get().map((s) => (s.id && set.has(s.id) ? update(s) : s)));
}

export const saveAnalysis = (key: string, analysis: AiAnalysis) => analysesStore.set({ ...analysesStore.get(), [key]: analysis });

export function setBudget(category: CategoryId, limit: number | null) {
  const next = { ...budgetsStore.get() };
  if (limit === null) delete next[category];
  else next[category] = limit;
  budgetsStore.set(next);
}

/** v1 (tek ekstre) kaydı varsa kütüphaneye taşır. Bir kez, açılışta çağrılır. */
export function migrateLegacyStorage() {
  const OLD = "ekstre-avukati:statement:v1";
  try {
    const raw = window.localStorage.getItem(OLD);
    if (!raw) return;
    if (statementsStore.get().length === 0) {
      const { statement, analysis } = migrateLegacy(JSON.parse(raw) as ParsedStatement);
      statementsStore.set([statement]);
      if (analysis && statement.id) saveAnalysis(statement.id, analysis);
    }
    window.localStorage.removeItem(OLD);
  } catch {
    /* bozuk eski kayıt: yok say */
  }
}
