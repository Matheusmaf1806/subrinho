import { TrackEvent } from "../../_components/tracking";
import { DateInput } from "@/components/date-picker";
import { notFound, redirect } from "next/navigation";
import { Marked } from "../../_components/journal";
import { Lock, ShieldCheck } from "lucide-react";
import { db } from "@/server/db";
import { loadCartView } from "@/server/cart/service";
import { getSettings } from "@/server/settings";
import { paymentProvider } from "@/server/payments/provider";
import { Alert, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { getStore, storeBase, viewerFor } from "../../_lib/store";
import { CartItemCard } from "../../_components/cart-item";
import { CartSummary } from "../../_components/cart-summary";
import { toItemVMs, totalsVM } from "../../_components/cart-vm";
import { storeInsight } from "../../_lib/insight";
import { TrackView } from "../../_components/track-view";
import { CustomerAuth } from "../../_components/auth-forms";
import { PayerFields, PaymentFields, TravelerFields } from "../../_components/checkout-fields";
import {
  agencyLoginAction,
  applyCouponAction,
  changePaxAction,
  customerLoginAction,
  customerRegisterAction,
  placeOrderAction,
  removeCartItemAction,
  removeCouponAction,
  setMarginOverrideAction,
  trackCartViewAction,
} from "../../actions";

export const metadata = { title: "Checkout" };

const lab = "mb-2 block text-[13px] font-medium text-muted";

function Step({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] bg-white p-6 ring-1 ring-inset ring-black/[0.06] sm:p-8">
      <div className="mb-6 flex items-start gap-4">
        <span className="text-[2.75rem] font-semibold leading-[0.8] tracking-[-0.06em] text-accent-ink tabular">{String(n).padStart(2, "0")}</span>
        <div>
          <h2 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.035em] text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const store = await getStore(slug);
  const sb = await storeBase(store);
  const [view, viewer, settings] = await Promise.all([loadCartView(db, token, store.id), viewerFor(store), getSettings(db)]);
  const provider = paymentProvider();
  if (!view) notFound();
  if (view.cart.status !== "OPEN" || view.items.length === 0 || view.removedNotices.length > 0) redirect(`${sb}/carrinho/${token}`);

  const adminMode = viewer?.kind === "AFFILIATE" && viewer.adminMode;
  const reveal = await storeInsight(store.id);
  const items = toItemVMs(view, { adminMode, reveal });
  const t = totalsVM(view, reveal);
  const next = `${sb}/checkout/${token}`;
  // Viajantes: adultos e crianças (hotéis pedem nome de todos, com a idade das crianças).
  const hotelItems = view.items.filter((i) => i.category === "LODGING");
  const travelerAdults = Math.min(16, Math.max(1, ...view.items.map((i) => (i.pax.adults ?? 0) + (i.pax.seniors ?? 0) + (i.category === "LODGING" ? 0 : (i.pax.children ?? 0)))));
  const childSource = [...hotelItems].sort((a, b) => (b.pax.children ?? 0) - (a.pax.children ?? 0))[0];
  const travelerChildAges = childSource ? (childSource.pax.childrenAges ?? []).slice(0, childSource.pax.children ?? 0) : [];

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8">
      <TrackView action={trackCartViewAction.bind(null, slug, token, "checkout")} />
      <TrackEvent name="begin_checkout" params={{ value: Number(view.priced.totals.pix), items: view.items.length }} />
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <h1 data-enter className="display text-[clamp(3rem,7vw,6rem)] text-ink">
          <Marked text="Finalizar compra" mark="compra" />
        </h1>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-4 text-[13px] font-semibold text-ink">
          <Lock className="h-4 w-4" /> Ambiente seguro
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px] xl:gap-10">
        <div className="space-y-4">
          <Step n={1} title="Seus itens" subtitle="Ajuste as quantidades aqui mesmo: o preço é recalculado com o fornecedor.">
            <div className="space-y-3">
              {adminMode && <Alert tone="info">Modo ADMIN ativo: você pode alterar a margem da agência em cada item (somente neste carrinho, nunca abaixo de 0%).</Alert>}
              {items.map((item) => (
                <CartItemCard
                  key={item.id}
                  item={item}
                  editable
                  removeAction={removeCartItemAction.bind(null, slug, token, item.id)}
                  paxAction={changePaxAction.bind(null, slug, token)}
                  marginAction={adminMode ? setMarginOverrideAction.bind(null, slug, token) : undefined}
                  maxMarginPct={settings.maxAffiliateMarginPct}
                />
              ))}
            </div>
          </Step>

          {!viewer ? (
            <Step n={2} title="Identificação" subtitle="Entre ou crie sua conta para concluir. Quem paga pode ser outra pessoa.">
              <CustomerAuth login={customerLoginAction.bind(null, slug)} register={customerRegisterAction.bind(null, slug)} agency={agencyLoginAction.bind(null, slug)} next={next} initial="register" />
            </Step>
          ) : (
            <ActionForm action={placeOrderAction.bind(null, slug, token)} className="space-y-4">
              <Step
                n={2}
                title={viewer.kind === "CUSTOMER" ? "Titular da conta" : "Dados do cliente"}
                subtitle={viewer.kind === "AFFILIATE" ? "Você está finalizando pela agência: informe o cliente (a conta é criada/encontrada pelo e-mail)." : undefined}
              >
                {viewer.kind === "CUSTOMER" ? (
                  <div className="rounded-2xl bg-surface p-4 text-[15px]">
                    <p className="font-semibold text-ink">{viewer.customer.name}</p>
                    <p className="text-[14px] text-muted">
                      {viewer.customer.email} · {viewer.customer.phone ?? "sem telefone"} · CPF {viewer.customer.document ?? "-"}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className={lab}>Nome completo do cliente</span>
                      <Input name="customerName" required />
                    </label>
                    <label className="block">
                      <span className={lab}>E-mail</span>
                      <Input name="customerEmail" type="email" required />
                    </label>
                    <label className="block">
                      <span className={lab}>Celular</span>
                      <Input name="customerPhone" required inputMode="tel" />
                    </label>
                    <label className="block">
                      <span className={lab}>CPF</span>
                      <Input name="customerDocument" required inputMode="numeric" />
                    </label>
                    <label className="block">
                      <span className={lab}>Nascimento</span>
                      <DateInput name="customerBirthDate" birth placeholder="Escolha a data" />
                    </label>
                  </div>
                )}
              </Step>

              <Step n={3} title="Pagador" subtitle="Quem tem a conta e quem paga podem ser pessoas diferentes.">
                <PayerFields sameLabel={viewer.kind === "CUSTOMER" ? "O pagador sou eu (titular da conta)" : "O pagador é o próprio cliente"} />
              </Step>

              <Step n={4} title="Viajantes">
                <TravelerFields adults={travelerAdults} childAges={travelerChildAges} hotel={hotelItems.length > 0} firstName={viewer.kind === "CUSTOMER" ? viewer.customer.name : undefined} />
                {hotelItems.length > 0 && (
                  <label className="mt-4 block">
                    <span className={lab}>Pedido especial ao hotel (opcional)</span>
                    <textarea
                      name="specialRequests"
                      maxLength={500}
                      rows={2}
                      placeholder="Ex.: chegada após as 22h, cama de casal, andar alto…"
                      className="block w-full rounded-2xl border-0 bg-surface px-4 py-3 text-[15px] text-ink ring-1 ring-inset ring-transparent placeholder:text-muted/70 focus:ring-2 focus:ring-ink"
                    />
                    <span className="mt-1 block text-xs text-muted">Repassamos ao hotel junto com a reserva. Pedidos especiais dependem de disponibilidade e não são garantidos.</span>
                  </label>
                )}
              </Step>

              <Step n={5} title="Pagamento">
                <PaymentFields
                  pix={Number(t.pix)}
                  installment={Number(t.installment)}
                  maxInstallments={settings.maxInstallments}
                  cardCheckout={provider.cardCheckout}
                  pixAvailable={provider.pixAvailable}
                  simulated={provider.name === "mock"}
                />
                <SubmitButton variant="accent" size="lg" className="mt-6 h-16 w-full text-base" pendingText={provider.cardCheckout === "paypal" ? "Confirmando preços…" : "Processando pagamento…"}>
                  {provider.cardCheckout === "paypal" ? "Continuar para o pagamento →" : "Pagar e concluir →"}
                </SubmitButton>
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
                  <ShieldCheck className="h-4 w-4" /> Antes de cobrar, confirmamos preço e disponibilidade com cada fornecedor.
                </p>
              </Step>
            </ActionForm>
          )}
        </div>
        <aside className="lg:sticky lg:top-[calc(var(--store-top,72px)+24px)] lg:self-start">
          <CartSummary t={t} couponAction={applyCouponAction.bind(null, slug, token)} removeCoupon={(layer) => removeCouponAction.bind(null, slug, token, layer)} />
        </aside>
      </div>
    </main>
  );
}
