"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Money } from "./ui";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fareyi takip eden 3B eğim işleyicileri. Değerleri doğrudan olayın öğesine CSS
 * değişkeni olarak yazar (her harekette React yeniden çizilmez, ref gerekmez).
 * Dokunmatikte ve "hareketi azalt"ta kapalı.
 */
export function tiltHandlers(max = 7) {
  return {
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (e.pointerType !== "mouse" || reducedMotion()) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty("--ry", `${(px - 0.5) * 2 * max}deg`);
      el.style.setProperty("--rx", `${-(py - 0.5) * 2 * max}deg`);
      el.style.setProperty("--ty", "-4px");
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      el.dataset.active = "true";
    },
    onPointerLeave(e: PointerEvent<HTMLElement>) {
      const el = e.currentTarget;
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--ty", "0px");
      el.dataset.active = "false";
    },
  };
}

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Değer değişince eski değerden yenisine sayarak geçen sayı (ör. ekstre değiştirince).
 * İlk çizimde 0'dan sayar.
 */
export function useCountUp(target: number, duration = 900): number {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (reducedMotion() || from === target) {
      fromRef.current = target;
      const id = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (target - from) * easeOutExpo(t);
      fromRef.current = v;
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

/** Sayarak güncellenen para tutarı (ekran okuyucuya son değer okunur). */
export function CountUpMoney({ value, decimals = true, className }: { value: number; decimals?: boolean; className?: string }) {
  const shown = useCountUp(value);
  return <Money value={decimals ? Math.round(shown * 100) / 100 : Math.round(shown)} decimals={decimals} className={className} />;
}

/** Sayarak güncellenen tam sayı. */
export function CountUpNumber({ value }: { value: number }) {
  return <>{Math.round(useCountUp(value, 700))}</>;
}
