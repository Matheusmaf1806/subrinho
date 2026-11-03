import { notFound, redirect } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import { db } from "@/server/db";
import { loadCartView } from "@/server/cart/service";
import { getSettings } from "@/server/settings";
import { Alert, Card, CardBody, CardHeader, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui-client";
import { getStore, viewerFor } from "../../_lib/store";
import { CartItemCard } from "../../_components/cart-item";
import { CartSummary } from "../../_components/cart-summary";
import { toItemVMs, totalsVM } from "../../_components/cart-vm";
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

const lab = "mb-1.5 block text-sm font-bold text-ink";

function Step({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-sm font-black text-white">{n}</span>
            {title}
          </span>
        }
        subtitle={subtitle}
      />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const store = await getStore(slug);
  const [view, viewer, settings] = await Promise.all([loadCartView(db, token, store.id), viewerFor(store), getSettings(db)]);
  if (!view) notFound();
  if (view.cart.status !== "OPEN" || view.items.length === 0 || view.removedNotices.length > 0) redirect(`/loja/${slug}/carrinho/${token}`);

  const adminMode = viewer?.kind === "AFFILIATE" && viewer.adminMode;
  const items = toItemVMs(view, { adminMode });
  const t = totalsVM(view);
  const next = `/loja/${slug}/checkout/${token}`;
  const travelers = Math.min(10, Math.max(1, ...view.items.map((i) => (i.pax.adults ?? 0) + (i.pax.children ?? 0) + (i.pax.seniors ?? 0))));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TrackView action={trackCartViewAction.bind(null, slug, token, "checkout")} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-black tracking-tight text-ink">Finalizar compra</h1>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted">
          <Lock className="h-4 w-4" /> Ambiente seguro
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Step n={1} title="Seus itens" subtitle="Ajuste as quantidades aqui mesmo — o preço é recalculado com o fornecedor.">
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
            <ActionForm action={placeOrderAction.bind(null, slug, token)} className="space-y-5">
              <Step
                n={2}
                title={viewer.kind === "CUSTOMER" ? "Titular da conta" : "Dados do cliente"}
                subtitle={viewer.kind === "AFFILIATE" ? "Você está finalizando pela agência: informe o cliente (a conta é criada/encontrada pelo e-mail)." : undefined}
              >
                {viewer.kind === "CUSTOMER" ? (
                  <div className="text-sm">
                    <p className="font-extrabold text-ink">{viewer.customer.name}</p>
                    <p className="text-muted">
                      {viewer.customer.email} · {viewer.customer.phone ?? "sem telefone"} · CPF {viewer.customer.document ?? "—"}
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
                      <Input name="customerBirthDate" type="date" />
                    </label>
                  </div>
                )}
              </Step>

              <Step n={3} title="Pagador" subtitle="Quem tem a conta e quem paga podem ser pessoas diferentes.">
                <PayerFields sameLabel={viewer.kind === "CUSTOMER" ? "O pagador sou eu (titular da conta)" : "O pagador é o próprio cliente"} />
              </Step>

              <Step n={4} title="Viajantes">
                <TravelerFields count={travelers} firstName={viewer.kind === "CUSTOMER" ? viewer.customer.name : undefined} />
              </Step>

              <Step n={5} title="Pagamento">
                <PaymentFields pix={Number(t.pix)} installment={Number(t.installment)} maxInstallments={settings.maxInstallments} />
                <SubmitButton variant="accent" size="lg" className="mt-5 w-full" pendingText="Processando pagamento…">
                  Pagar e concluir
                </SubmitButton>
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted">
                  <ShieldCheck className="h-4 w-4" /> Antes de cobrar, confirmamos preço e disponibilidade com cada fornecedor.
                </p>
              </Step>
            </ActionForm>
          )}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <CartSummary t={t} couponAction={applyCouponAction.bind(null, slug, token)} removeCoupon={(layer) => removeCouponAction.bind(null, slug, token, layer)} />
        </aside>
      </div>
    </main>
  );
}
