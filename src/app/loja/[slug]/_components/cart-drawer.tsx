"use client";

/**
 * Carrinho flutuante: o botão "Carrinho" do topo abre uma gaveta com os itens e os totais, sem sair da
 * página. Abre sozinho quando um item é adicionado (openCartDrawer). Os dados vêm do servidor na hora
 * de abrir — mesmos preços da página do carrinho.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CircleCheck, Loader2, ShoppingBag, Trash2, Users, X } from "lucide-react";
import { cn } from "@/components/ui";
import { miniCartAction, removeMiniCartItemAction, type MiniCart } from "../actions";

const EVENT = "store:open-cart";
const fmt = (v: string | number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Abre o carrinho flutuante (ex.: depois de adicionar um item). */
export function openCartDrawer(detail: { added?: boolean } = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
}

export function CartDrawer({
  slug,
  count,
  cartHref,
  pixAvailable,
  categories,
}: {
  slug: string;
  count: number;
  cartHref: string;
  pixAvailable: boolean;
  categories: { slug: string; short: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [cart, setCart] = useState<MiniCart | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [, start] = useTransition();
  const closeRef = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const base = `/loja/${slug}`;
  // a gaveta vai direto no <body>: o topo tem desfoque (backdrop-filter), que prenderia o "fixed" dentro dele
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCart(await miniCartAction(slug));
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const show = useCallback(
    (justAdded = false) => {
      setAdded(justAdded);
      setOpen(true);
      void load();
    },
    [load],
  );

  useEffect(() => {
    const onOpen = (e: Event) => show(!!(e as CustomEvent<{ added?: boolean }>).detail?.added);
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, [show]);

  // Esc fecha, a página atrás não rola, o foco vai para a gaveta e volta ao botão ao fechar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const btn = trigger.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      btn?.focus();
    };
  }, [open]);

  async function remove(id: string) {
    setRemoving(id);
    try {
      setCart(await removeMiniCartItemAction(slug, id));
      setAdded(false);
      start(() => router.refresh());
    } finally {
      setRemoving(null);
    }
  }

  const items = cart?.items ?? [];
  const n = cart ? items.length : count;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => show(false)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink-2"
      >
        <ShoppingBag className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Carrinho</span>
        {count > 0 && (
          <span key={count} className="pop grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-fg">
            {count}
          </span>
        )}
        <span className="sr-only">{count === 1 ? "1 item" : `${count} itens`}</span>
      </button>

      {mounted &&
        createPortal(
      <div className={cn("fixed inset-0 z-[60]", open ? "visible" : "pointer-events-none invisible transition-[visibility] delay-300")} inert={!open}>
        <div className={cn("absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Seu carrinho"
          className={cn(
            "absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col bg-white shadow-[0_0_80px_-20px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out sm:inset-y-3 sm:right-3 sm:rounded-[2rem]",
            open ? "translate-x-0" : "translate-x-[105%]",
          )}
        >
          <header className="flex items-center justify-between gap-3 px-6 pb-4 pt-6">
            <div>
              <h2 className="text-[1.6rem] font-semibold leading-none tracking-[-0.04em] text-ink">Seu carrinho</h2>
              <p className="mt-1.5 text-[13px] text-muted">{n === 0 ? "Nenhum item ainda" : n === 1 ? "1 item" : `${n} itens`}</p>
            </div>
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-full bg-surface text-ink transition hover:bg-surface-2" aria-label="Fechar carrinho">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          {added && cart && items.length > 0 && (
            <p className="mx-6 mb-3 flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-3 text-[14px] font-semibold text-success" role="status">
              <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> Adicionado com o preço confirmado pelo fornecedor.
            </p>
          )}
          {cart && cart.removed > 0 && (
            <p className="mx-6 mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              Alguns itens saíram do carrinho (data passou ou esgotou). <Link href={cartHref} className="font-semibold underline">Ver detalhes</Link>
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            {cart === undefined || (loading && !cart) ? (
              <ul className="space-y-3" aria-busy="true">
                {Array.from({ length: Math.max(1, Math.min(count, 3)) }, (_, i) => (
                  <li key={i} className="flex gap-3 rounded-2xl p-1">
                    <span className="h-20 w-20 shrink-0 animate-pulse rounded-2xl bg-surface" />
                    <span className="flex-1 space-y-2 py-1">
                      <span className="block h-3 w-1/3 animate-pulse rounded bg-surface" />
                      <span className="block h-4 w-4/5 animate-pulse rounded bg-surface" />
                      <span className="block h-3 w-1/2 animate-pulse rounded bg-surface" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-surface text-ink">
                  <ShoppingBag className="h-7 w-7" aria-hidden />
                </span>
                <p className="mt-5 text-lg font-semibold text-ink">Seu carrinho está vazio</p>
                <p className="mt-1 max-w-[16rem] text-[14px] text-muted">Monte a viagem inteira aqui: tudo no mesmo pagamento.</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {categories.map((c) => (
                    <Link key={c.slug} href={`${base}/${c.slug}`} onClick={() => setOpen(false)} className="rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-surface-2">
                      {c.short}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((i) => (
                  <li key={i.id} className={cn("flex gap-3 py-4 transition-opacity", removing === i.id && "opacity-40")}>
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-surface">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {i.imageUrl && <img src={i.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{i.category}</p>
                      <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{i.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">
                        {i.when && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {i.when}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" aria-hidden /> {i.pax}
                        </span>
                      </p>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <p className="leading-tight">
                          <span className="text-[15px] font-semibold text-ink tabular">{fmt(pixAvailable ? i.pix : i.installment)}</span>
                          {pixAvailable && <span className="ml-1 text-[11px] font-semibold text-accent-ink">Pix</span>}
                        </p>
                        <button
                          type="button"
                          onClick={() => remove(i.id)}
                          disabled={!!removing}
                          className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-muted transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                          aria-label={`Remover ${i.title}`}
                        >
                          {removing === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />} Remover
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {cart && items.length > 0 && (
            <footer className="border-t border-line px-6 pb-6 pt-5">
              {Number(cart.discount) > 0 && (
                <p className="mb-2 flex justify-between text-[14px] font-semibold text-success">
                  <span>Descontos</span> <span className="tabular">− {fmt(cart.discount)}</span>
                </p>
              )}
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[13px] text-muted">{pixAvailable ? "Total no Pix" : "Total"}</p>
                  <p className="text-[2rem] font-semibold leading-none tracking-[-0.04em] text-ink tabular">{fmt(pixAvailable ? cart.pix : cart.installment)}</p>
                </div>
                <p className="text-right text-[13px] leading-snug text-muted">
                  ou {cart.planCount}x de <span className="font-semibold text-ink">{fmt(cart.planInstallment)}</span>
                  <br />
                  sem juros{pixAvailable ? ` · ${fmt(cart.installment)}` : ""}
                </p>
              </div>
              <Link
                href={`${base}/checkout/${cart.token}`}
                onClick={() => setOpen(false)}
                className="mt-5 flex h-14 w-full items-center justify-center rounded-full bg-accent text-[15px] font-semibold text-accent-fg transition hover:opacity-90"
              >
                Finalizar compra →
              </Link>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link href={`${base}/carrinho/${cart.token}`} onClick={() => setOpen(false)} className="flex h-12 items-center justify-center rounded-full bg-surface text-[14px] font-semibold text-ink transition hover:bg-surface-2">
                  Ver carrinho
                </Link>
                <button type="button" onClick={() => setOpen(false)} className="h-12 rounded-full text-[14px] font-semibold text-ink transition hover:bg-surface">
                  Continuar comprando
                </button>
              </div>
              <p className="mt-3 text-center text-[12px] text-muted">Cupom de desconto e compartilhar o carrinho: em “Ver carrinho”.</p>
            </footer>
          )}
        </aside>
      </div>,
          document.body,
        )}
    </>
  );
}
