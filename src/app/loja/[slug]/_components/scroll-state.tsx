"use client";

import { useEffect } from "react";

/** Marca <html data-scrolled> quando a página rolou (topo da loja ganha sombra e mais vidro). */
export function ScrollState() {
  useEffect(() => {
    const el = document.documentElement;
    const on = () => (window.scrollY > 8 ? el.setAttribute("data-scrolled", "") : el.removeAttribute("data-scrolled"));
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      el.removeAttribute("data-scrolled");
    };
  }, []);
  return null;
}
