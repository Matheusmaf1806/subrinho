"use client";

import { useEffect, useRef } from "react";

/** Registra um acesso ao carrinho quando a página é aberta no navegador (não conta prefetch/bots). */
export function TrackView({ action }: { action: () => Promise<void> }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    action().catch(() => {});
  }, [action]);
  return null;
}
