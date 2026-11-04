"use client";

/**
 * Número que "conta" até o valor ao aparecer (indicadores dos painéis), mantendo o formato
 * brasileiro do texto original: "R$ 111.742,24", "20", "4,9300", "12%". Sem número → texto como está.
 * Respeita "reduzir movimento" e começa já no valor final no servidor (sem pulo para quem não tem JS).
 */
import { useEffect, useRef, useState } from "react";

const NUM = /-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?/;

function parse(text: string) {
  const m = text.match(NUM);
  if (!m || m.index === undefined) return null;
  const raw = m[0];
  const decimals = raw.includes(",") ? raw.split(",")[1].length : 0;
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return { before: text.slice(0, m.index), after: text.slice(m.index + raw.length), value, decimals, grouped: raw.includes(".") || Math.abs(value) >= 1000 };
}

export function CountUp({ text, duration = 900 }: { text: string; duration?: number }) {
  const p = parse(text);
  const [shown, setShown] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!p || !ref.current) return;
    if (document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const fmt = (v: number) => `${p.before}${v.toLocaleString("pt-BR", { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals, useGrouping: p.grouped })}${p.after}`;
    let raf = 0;
    let start = 0;
    let done = 0;
    const run = () => {
      // garantia: mesmo se o navegador pausar a animação (aba em segundo plano), termina no valor certo
      done = window.setTimeout(() => {
        cancelAnimationFrame(raf);
        setShown(text);
      }, duration + 250);
      const tick = (t: number) => {
        if (!start) start = t;
        const k = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - k, 3);
        setShown(fmt(p.value * eased));
        if (k < 1) raf = requestAnimationFrame(tick);
        else setShown(text);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    });
    io.observe(ref.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <span ref={ref} aria-label={text}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}
