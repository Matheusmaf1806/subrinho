import { notFound } from "next/navigation";
import { CircleAlert, Share2, ShoppingCart } from "lucide-react";
import { db } from "@/server/db";
import { loadCartView } from "@/server/cart/service";
import { getSettings } from "@/server/settings";
import { Alert, Button, ButtonLink, Card, EmptyState } from "@/components/ui";
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
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TrackView action={trackCartViewAction.bind(null, slug, token, "cart")} />
      <h1 className="text-3xl font-black tracking-tight text-ink">Carrinho</h1>
      <p className="mt-1 text-sm text-muted">Criado em {dateTime(view.cart.createdAt)} · este carrinho não expira</p>

      {sp.adicionado && open && (
        <Alert tone="success" className="mt-4">
          Item adicionado ao carrinho com o preço confirmado pelo fornecedor.
        </Alert>
      )}

      {view.removedNotices.length > 0 && (
        <Alert tone="warning" className="mt-4" title="Removemos itens cuja data já passou">
          <ul className="mt-1 list-disc pl-5">
            {view.removedNotices.map((i) => (
              <li key={i.id}>
                {i.title}
                {i.subtitle ? ` — ${i.subtitle}` : ""} {i.serviceDate ? `(${date(i.serviceDate)})` : ""}: {i.statusReason}
              </li>
            ))}
          </ul>
          <p className="mt-1">Os demais itens continuam no seu carrinho.</p>
          <form action={acknowledgeNoticesAction.bind(null, slug, token)} className="mt-2">
            <Button size="sm" variant="outline">
              Entendi
            </Button>
          </form>
        </Alert>
      )}

      {!open && (
        <Alert tone="success" className="mt-4" title="Este carrinho já foi pago">
          {paidOrder && (viewer ? <a className="font-bold underline" href={`/loja/${slug}/pedido/${paidOrder.id}`}>Ver pedido {orderNumber(paidOrder.number)}</a> : `Pedido ${orderNumber(paidOrder.number)}`)}
        </Alert>
      )}

      {items.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon={<ShoppingCart className="h-12 w-12" />}
            title="Nenhum item no carrinho"
            description="Adicione ingressos, hospedagem, casas, seguro viagem ou chip."
            action={<ButtonLink href={`/loja/${slug}`} variant="accent">Explorar a loja</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-3">
            {adminMode && open && (
              <Alert tone="info">
                <CircleAlert className="mr-1 inline h-4 w-4" /> Modo ADMIN: use “Margem” em cada item para alterar a margem da agência somente neste carrinho.
              </Alert>
            )}
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
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {!open ? (
              <Card className="p-5 text-sm text-muted">
                Os valores pagos estão no pedido{paidOrder ? ` ${orderNumber(paidOrder.number)}` : ""}. Para uma nova viagem,{" "}
                <a className="font-bold text-accent" href={`/loja/${slug}`}>
                  monte um novo carrinho
                </a>
                .
              </Card>
            ) : (
            <CartSummary t={t} couponAction={open ? applyCouponAction.bind(null, slug, token) : undefined} removeCoupon={open ? (layer) => removeCouponAction.bind(null, slug, token, layer) : undefined}>
              {open && (
                <ButtonLink href={`/loja/${slug}/checkout/${token}`} variant="accent" size="lg" className="w-full">
                  Finalizar compra
                </ButtonLink>
              )}
            </CartSummary>
            )}
            {open && (
            <Card className="p-5">
              <p className="inline-flex items-center gap-2 font-extrabold text-ink">
                <Share2 className="h-4 w-4 text-accent" /> Compartilhar carrinho
              </p>
              <p className="mt-1 text-sm text-muted">Envie o link para quem vai pagar. Os preços são atualizados quando o link é aberto.</p>
              <div className="mt-3 flex gap-2">
                <input readOnly value={shareUrl} className="min-w-0 flex-1 truncate rounded-xl border border-line bg-cream px-3 py-2 text-xs" aria-label="Link do carrinho" />
                <CopyButton text={shareUrl} label="Copiar link" />
              </div>
              <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-accent hover:underline">
                Enviar pelo WhatsApp →
              </a>
            </Card>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
