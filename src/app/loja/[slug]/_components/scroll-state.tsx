"use client";

import { useEffect } from "react";

/**
 * Marca <html data-scrolled> quando a página rolou (topo da loja ganha sombra e mais vidro) e mede a
 * altura do topo fixo em --store-top (muda com a barra "Modo ADMIN" e no celular): menus e painéis
 * grudados usam essa altura para não ficar por baixo do topo.
 */
export function ScrollState() {
  useEffect(() => {
    const el = document.documentElement;
    const on = () => (window.scrollY > 8 ? el.setAttribute("data-scrolled", "") : el.removeAttribute("data-scrolled"));
    on();
    window.addEventListener("scroll", on, { passive: true });
    const header = document.querySelector<HTMLElement>(".store-header");
    const measure = () => header && el.style.setProperty("--store-top", `${Math.round(header.getBoundingClientRect().height)}px`);
    measure();
    const ro = header ? new ResizeObserver(measure) : null;
    if (header) ro!.observe(header);
    return () => {
      window.removeEventListener("scroll", on);
      ro?.disconnect();
      el.removeAttribute("data-scrolled");
      el.style.removeProperty("--store-top");
    };
  }, []);
  return null;
}
