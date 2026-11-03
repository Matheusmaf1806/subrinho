import { notFound } from "next/navigation";
import { Share2, ShoppingCart } from "lucide-react";
import { db } from "@/server/db";
import { loadCartView } from "@/server/cart/service";
import { getSettings } from "@/server/settings";
import { Alert, Button, ButtonLink, buttonClass, EmptyState } from "@/components/ui";
import { CopyButton } from "@/components/ui-client";
import { date, dateTime, orderNumber } from "@/lib/format";
import { appUrl, getStore, viewerFor } from "../../_lib/store";
import { CartItemCard } from "../../_components/cart-item";
import { CartSummary } from "../../_components/cart-summary";
import { toItemVMs, totalsVM } from "../../_components/cart-vm";
import { TrackView } from "../../_components/track-view";
import {
  acknowledgeNoticesAction,
  applyCouponAction,
  changePaxAction,
  removeCartItemAction,
  removeCouponAction,
  setMarginOverrideAction,
  trackCartViewAction,
} from "../../actions";
import { orders } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const metadata = { title: "Carrinho" };

export default async function CartPage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ adicionado?: string }> }) {
  const { slug, token } = await params;
  const sp = await searchParams;
  const store = await getStore(slug);
  const [view, viewer, settings] = await Promise.all([loadCartView(db, token, store.id), viewerFor(store), getSettings(db)]);
  if (!view) notFound();
  const adminMode = viewer?.kind === "AFFILIATE" && viewer.adminMode;
  const items = toItemVMs(view, { adminMode });
  const t = totalsVM(view);
  const open = view.cart.status === "OPEN";
  const shareUrl = `${appUrl()}/loja/${slug}/carrinho/${token}`;
  const waText = encodeURIComponent(`Olha a viagem que montei na ${store.name}: ${shareUrl}`);

  let paidOrder: { id: string; number: number } | null = null;
  if (!open && view.cart.convertedOrderId) {
    const [o] = await db.select({ id: orders.id, number: orders.number }).from(orders).where(eq(orders.id, view.cart.convertedOrderId));
    paidOrder = o ?? null;
  }

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8">
      <TrackView action={trackCartViewAction.bind(null, slug, token, "cart")} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">Criado em {dateTime(view.cart.createdAt)} · este carrinho não expira</p>
          <h1 className="display mt-3 text-[clamp(3rem,7vw,6rem)] text-ink">Seu carrinho</h1>
        </div>
        {items.length > 0 && <p className="text-[15px] text-muted">{items.length} {items.length === 1 ? "item" : "itens"}</p>}
      </div>

      <div className="mt-8 space-y-3">
        {sp.adicionado && open && <Alert tone="success">Item adicionado com o preço confirmado pelo fornecedor.</Alert>}
        {view.removedNotices.length > 0 && (
          <Alert tone="warning" title="Removemos itens cuja data já passou">
            <ul className="mt-1 list-disc pl-5">
              {view.removedNotices.map((i) => (
                <li key={i.id}>
                  {i.title}
                  {i.subtitle ? ` — ${i.subtitle}` : ""} {i.serviceDate ? `(${date(i.serviceDate)})` : ""}: {i.statusReason}
                </li>
              ))}
            </ul>
            <p className="mt-1">Os demais itens continuam no seu carrinho.</p>
            <form action={acknowledgeNoticesAction.bind(null, slug, token)} className="mt-3">
              <Button size="sm" variant="dark">
                Entendi
              </Button>
            </form>
          </Alert>
        )}
        {!open && (
          <Alert tone="success" title="Este carrinho já foi pago">
            {paidOrder &&
              (viewer ? (
                <a className="font-semibold underline" href={`/loja/${slug}/pedido/${paidOrder.id}`}>
                  Ver pedido {orderNumber(paidOrder.number)}
                </a>
              ) : (
                `Pedido ${orderNumber(paidOrder.number)}`
              ))}
          </Alert>
        )}
        {adminMode && open && items.length > 0 && <Alert tone="info">Modo ADMIN: use “Margem” em cada item para alterar a margem da agência somente neste carrinho.</Alert>}
      </div>

      {items.length === 0 ? (
        <div className="mt-8 rounded-[2rem] bg-surface">
          <EmptyState
            icon={<ShoppingCart className="h-10 w-10" />}
            title="Nenhum item no carrinho"
            description="Adicione ingressos, hospedagem, casas, seguro viagem ou chip."
            action={<ButtonLink href={`/loja/${slug}`} variant="dark" size="lg">Explorar a loja →</ButtonLink>}
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px] xl:gap-10">
          <div className="space-y-3">
            {items.map((item) => (
              <CartItemCard
                key={item.id}
                item={item}
                editable={open}
                removeAction={removeCartItemAction.bind(null, slug, token, item.id)}
                paxAction={changePaxAction.bind(null, slug, token)}
                marginAction={adminMode ? setMarginOverrideAction.bind(null, slug, token) : undefined}
                maxMarginPct={settings.maxAffiliateMarginPct}
              />
            ))}
          </div>
          <aside className="space-y-3 lg:sticky lg:top-28 lg:self-start">
            {!open ? (
              <div className="rounded-[2rem] bg-surface p-6 text-[15px] text-muted">
                Os valores pagos estão no pedido{paidOrder ? ` ${orderNumber(paidOrder.number)}` : ""}. Para uma nova viagem,{" "}
                <a className="font-semibold text-ink underline" href={`/loja/${slug}`}>
                  monte um novo carrinho
                </a>
                .
              </div>
            ) : (
              <CartSummary t={t} couponAction={applyCouponAction.bind(null, slug, token)} removeCoupon={(layer) => removeCouponAction.bind(null, slug, token, layer)}>
                <ButtonLink href={`/loja/${slug}/checkout/${token}`} variant="accent" size="lg" className="w-full">
                  Finalizar compra →
                </ButtonLink>
              </CartSummary>
            )}
            {open && (
              <div className="rounded-[2rem] bg-surface p-6">
                <p className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em] text-ink">
                  <Share2 className="h-4 w-4 text-accent-ink" /> Compartilhar carrinho
                </p>
                <p className="mt-1 text-[14px] text-muted">Envie o link para quem vai pagar. Os preços são atualizados quando o link é aberto.</p>
                <div className="mt-4 flex gap-2 rounded-full bg-white p-1">
                  <input readOnly value={shareUrl} className="min-w-0 flex-1 truncate bg-transparent px-4 text-xs text-muted outline-none" aria-label="Link do carrinho" />
                  <CopyButton text={shareUrl} label="Copiar link" className={buttonClass("dark", "sm")} />
                </div>
                <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-9 items-center rounded-full px-1 text-[13px] font-semibold text-ink hover:text-accent-ink">
                  Enviar pelo WhatsApp →
                </a>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
