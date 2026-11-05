"use client";

/**
 * Pixel da Meta e Google Analytics 4 da agência, só depois do consentimento (LGPD). Sem IDs
 * configurados, não aparece aviso nem carrega nada. Eventos do funil: view_item, add_to_cart,
 * begin_checkout e purchase (mapeados para ViewContent, AddToCart, InitiateCheckout e Purchase).
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { OPEN_CART_EVENT } from "./cart-events";

export const CONSENT_COOKIE = "sb_consent";
export const OPEN_CONSENT_EVENT = "store:cookie-prefs";

type Params = { name?: string; category?: string; value?: number; currency?: string; id?: string; items?: number };
type Fn = (...a: unknown[]) => void;
type W = Window & { fbq?: Fn & { queue?: unknown[]; loaded?: boolean; version?: string; push?: Fn; callMethod?: Fn }; _fbq?: unknown; dataLayer?: unknown[]; gtag?: Fn; __sbq?: [string, Params][]; subrinhoTrack?: (n: string, p: Params) => void };

/** Dispara um evento (ou guarda até o consentimento). */
export function track(name: string, params: Params = {}) {
  const w = window as W;
  if (w.subrinhoTrack) w.subrinhoTrack(name, params);
  else (w.__sbq ??= []).push([name, params]);
}

const META: Record<string, string> = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase" };

function readConsent(): "all" | "essential" | null {
  const m = document.cookie.match(/(?:^|;\s*)sb_consent=(all|essential)/);
  return (m?.[1] as "all" | "essential" | undefined) ?? null;
}

function loadScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function startTracking(pixelId: string | null, ga4Id: string | null) {
  const w = window as W;
  if (w.subrinhoTrack) return;
  if (pixelId) {
    if (!w.fbq) {
      const f = function (...args: unknown[]) {
        if (f.callMethod) f.callMethod(...args);
        else f.queue!.push(args);
      } as NonNullable<W["fbq"]>;
      f.push = f;
      f.loaded = true;
      f.version = "2.0";
      f.queue = [];
      w.fbq = f;
      w._fbq = f;
      loadScript("https://connect.facebook.net/en_US/fbevents.js");
    }
    w.fbq("init", pixelId);
    w.fbq("track", "PageView");
  }
  if (ga4Id) {
    w.dataLayer ??= [];
    w.gtag = function (...args: unknown[]) {
      // o gtag.js espera o objeto "arguments"
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
      void args;
    };
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`);
    w.gtag("js", new Date());
    w.gtag("config", ga4Id);
  }
  w.subrinhoTrack = (name, p) => {
    const value = typeof p.value === "number" && Number.isFinite(p.value) ? Math.round(p.value * 100) / 100 : undefined;
    const currency = p.currency ?? "BRL";
    if (pixelId && w.fbq && META[name])
      w.fbq("track", META[name], { ...(value !== undefined ? { value, currency } : {}), ...(p.name ? { content_name: p.name } : {}), ...(p.category ? { content_category: p.category } : {}), ...(p.items ? { num_items: p.items } : {}) }, p.id ? { eventID: `${name}-${p.id}` } : undefined);
    if (ga4Id && w.gtag)
      w.gtag("event", name, { ...(value !== undefined ? { value, currency } : {}), ...(p.id && name === "purchase" ? { transaction_id: p.id } : {}), ...(p.name ? { items: [{ item_name: p.name, item_category: p.category }] } : {}) });
  };
  for (const [n, p] of w.__sbq?.splice(0) ?? []) w.subrinhoTrack(n, p);
}

export function StoreTracking({ pixelId, ga4Id, privacyHref }: { pixelId: string | null; ga4Id: string | null; privacyHref: string }) {
  const enabled = !!(pixelId || ga4Id);
  const [consent, setConsent] = useState<"all" | "essential" | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    const c = readConsent();
    setConsent(c);
    setOpen(c === null);
    if (c === "all") startTracking(pixelId, ga4Id);
    const reopen = () => setOpen(true);
    const added = (e: Event) => {
      if ((e as CustomEvent<{ added?: boolean }>).detail?.added) track("add_to_cart");
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    window.addEventListener(OPEN_CART_EVENT, added);
    return () => {
      window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
      window.removeEventListener(OPEN_CART_EVENT, added);
    };
  }, [enabled, pixelId, ga4Id]);

  // navegação interna conta como nova página
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const w = window as W;
    if (consent !== "all") return;
    if (pixelId) w.fbq?.("track", "PageView");
    if (ga4Id) w.gtag?.("event", "page_view", { page_location: window.location.href });
  }, [pathname, consent, pixelId, ga4Id]);

  if (!enabled || !open) return null;
  const choose = (v: "all" | "essential") => {
    document.cookie = `${CONSENT_COOKIE}=${v}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    setConsent(v);
    setOpen(false);
    if (v === "all") startTracking(pixelId, ga4Id);
    else if (readConsent() === "essential" && (window as W).subrinhoTrack) location.reload(); // desliga o que já estava carregado
    else (window as W).__sbq = [];
  };
  return (
    <div role="dialog" aria-label="Aviso de cookies" className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-2xl bg-white p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] ring-1 ring-line sm:p-5">
      <p className="text-[14px] leading-relaxed text-ink">
        Usamos cookies essenciais para a loja funcionar e, com a sua permissão, cookies de análise e marketing para medir visitas e anúncios.{" "}
        <a href={privacyHref} className="font-semibold underline underline-offset-2">
          Política de privacidade
        </a>
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => choose("essential")} className="h-10 rounded-full px-4 text-[14px] font-semibold text-ink ring-1 ring-line hover:bg-surface">
          Só essenciais
        </button>
        <button type="button" onClick={() => choose("all")} className="h-10 rounded-full bg-ink px-4 text-[14px] font-semibold text-white hover:bg-ink-2">
          Aceitar todos
        </button>
      </div>
    </div>
  );
}

export function CookiePrefsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}>
      Preferências de cookies
    </button>
  );
}

/** Evento do funil ao abrir a página (ex.: view_item, begin_checkout). `once` evita repetir (purchase). */
export function TrackEvent({ name, params = {}, once }: { name: string; params?: Params; once?: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (once) {
      try {
        const k = `sb_ev_${once}`;
        if (localStorage.getItem(k)) return;
        localStorage.setItem(k, "1");
      } catch {
        /* sem armazenamento: dispara mesmo assim */
      }
    }
    track(name, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
