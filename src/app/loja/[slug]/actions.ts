"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { affiliateUsers, cartItems, customers, loginAttempts, orders, type PaxConfig, type PersonData } from "@/server/db/schema";
import { endSession, ensureVisitorId, requestMeta, setStoreAdminMode, startSession } from "@/server/auth/session";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  acknowledgeNotices,
  addQuoteToCart,
  applyCouponToCart,
  CartError,
  changeItemPax,
  getCartByToken,
  getOrCreateOpenCart,
  recordCartView,
  removeCouponFromCart,
  removeItem,
  setAffiliateMarginOverride,
} from "@/server/cart/service";
import { CheckoutError, findOrCreateCustomer, markOrderPaid, placeOrder } from "@/server/checkout/service";
import { validOrderAccessKey } from "@/server/order-access";
import { deleteCustomerAccount } from "@/server/customer-data";
import { recordAudit } from "@/server/audit";
import { loginBlocked, recordLogin, registerBlocked } from "@/server/auth/limits";
import { RESET_SENT_MESSAGE, requestPasswordReset, resetPassword, ResetError } from "@/server/auth/reset";
import { autoIssueOrder } from "@/server/bookings/service";
import { after } from "next/server";
import { isMockPayments, paymentProvider } from "@/server/payments/provider";
import { capturePaypalCheckout, createPaypalCheckout } from "@/server/payments/paypal-checkout";
import { parseProductRef, productRef } from "@/server/suppliers/refs";
import { getProductDetail } from "@/server/catalog";
import { quoteDisplayPrice } from "@/server/pricing/cart-pricing";
import { PricingError } from "@/server/pricing/engine";
import { getAdapter } from "@/server/suppliers/registry";
import { SupplierError, SupplierIntegrationError } from "@/server/suppliers/types";
import type { ActionState } from "@/components/ui-client";
import { isValidCpfOrCnpj, onlyDigits } from "@/lib/br";
import { date, paxSummary } from "@/lib/format";
import { loadCartView } from "@/server/cart/service";
import { storeInsight } from "./_lib/insight";
import { crossSellFor, type CrossSell } from "./_lib/cross-sell";
import { toItemVMs, totalsVM } from "./_components/cart-vm";
import { categoryLabel } from "./_components/category";
import { actorOf, currentCartToken, getStore, getStorePricing, revalidateStore, safeNext, setCurrentCartToken, storePath, viewerFor } from "./_lib/store";
import { parseSearch, supplierParams } from "./_components/search-params";

/** Mensagem para o cliente. Falha técnica de fornecedor (credencial, rede) nunca aparece crua. */
const userError = (e: unknown): string | null => {
  if (e instanceof SupplierIntegrationError) {
    console.error("[loja] fornecedor:", e.message, e.detail ?? "");
    return "Não conseguimos consultar o fornecedor agora. Tente novamente em instantes.";
  }
  return e instanceof CartError || e instanceof CheckoutError || e instanceof SupplierError || e instanceof PricingError ? e.message : null;
};

const int = (v: FormDataEntryValue | null, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
};
const str = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function paxFrom(fd: FormData): PaxConfig {
  const pax: PaxConfig = { adults: int(fd.get("adults")), children: int(fd.get("children")) };
  if (fd.has("seniors")) pax.seniors = int(fd.get("seniors"));
  if (fd.has("rooms")) pax.rooms = Math.max(1, int(fd.get("rooms"), 1));
  if (fd.has("units")) pax.units = Math.max(1, int(fd.get("units"), 1));
  // Hotéis: idade de cada criança ("7,10" ou vários campos childAge)
  const rawAges = [...String(fd.get("childrenAges") ?? "").split(","), ...fd.getAll("childAge").map(String)].map((x) => x.trim()).filter((x) => x !== "");
  if (fd.has("childrenAges") || fd.has("childAge")) {
    const ages = rawAges.map((x) => Number(x)).filter((a) => Number.isInteger(a) && a >= 0 && a <= 17);
    pax.childrenAges = ages.slice(0, pax.children);
  }
  return pax;
}

async function loadCart(slug: string, token: string) {
  const store = await getStore(slug);
  const cart = await getCartByToken(db, token, store.id);
  if (!cart) throw new CartError("Carrinho não encontrado");
  return { store, cart };
}

async function refreshCart(slug: string, token: string) {
  const store = await getStore(slug);
  revalidateStore(store, `/carrinho/${token}`);
  revalidateStore(store, `/checkout/${token}`);
  revalidateStore(store, "", "layout");
}

// ───────────── Carrinho ─────────────

export async function addToCartAction(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const store = await getStore(slug);
  const viewer = await viewerFor(store);
  let token: string;
  try {
    const target = parseProductRef(String(fd.get("ref") ?? ""));
    if (!target) return { error: "Produto indisponível" };
    const adapter = getAdapter(target.supplierCode);
    const quote = await adapter.quote({
      productId: target.productId,
      optionId: str(fd.get("optionId")) ?? null,
      date: str(fd.get("date")),
      checkIn: str(fd.get("checkIn")),
      checkOut: str(fd.get("checkOut")),
      startDate: str(fd.get("startDate")),
      endDate: str(fd.get("endDate")),
      pax: paxFrom(fd),
    });
    const cart = await db.transaction(async (tx) => {
      const c = await getOrCreateOpenCart(tx, store.id, await currentCartToken(store), actorOf(viewer));
      await addQuoteToCart(tx, c, quote, { destination: str(fd.get("destino")) });
      return c;
    });
    await setCurrentCartToken(store, cart.token);
  } catch (e) {
    const msg = userError(e) ?? (e instanceof Error && e.message.startsWith("Fornecedor desconhecido") ? "Produto indisponível" : null);
    if (msg) return { error: msg };
    throw e;
  }
  // fica na página: o carrinho flutuante abre com o item (o selo do topo atualiza junto)
  revalidateStore(store, "", "layout");
  return { ok: true };
}

// ───────────── Carrinho flutuante ─────────────

export type MiniCartItem = {
  id: string;
  category: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  when: string | null;
  pax: string;
  pix: string;
  installment: string;
  /** Só para quem pode ver (ver _lib/insight.ts). */
  supplier?: string;
  commission?: string;
};
export type MiniCart = { token: string; items: MiniCartItem[]; pix: string; installment: string; planCount: number; planInstallment: string; discount: string; removed: number; commission?: string };

/** Itens e totais do carrinho atual (mesmos preços da página do carrinho, sem dados internos). */
export async function miniCartAction(slug: string): Promise<MiniCart | null> {
  const store = await getStore(slug);
  const token = await currentCartToken(store);
  if (!token) return null;
  const view = await loadCartView(db, token, store.id);
  if (!view || view.cart.status !== "OPEN") return null;
  const reveal = await storeInsight(store.id);
  const t = totalsVM(view, reveal);
  return {
    token,
    ...(t.commission ? { commission: t.commission } : {}),
    items: toItemVMs(view, { adminMode: false, reveal }).map((i) => ({
      id: i.id,
      category: categoryLabel(i.category),
      title: i.title,
      subtitle: i.subtitle,
      imageUrl: i.imageUrl,
      when: i.serviceDate ? `${date(i.serviceDate)}${i.serviceEndDate ? ` a ${date(i.serviceEndDate)}` : ""}` : null,
      pax: paxSummary(i.pax),
      pix: i.pix,
      installment: i.installment,
      ...(i.reveal.supplier ? { supplier: i.reveal.supplier } : {}),
      ...(i.reveal.commission ? { commission: i.reveal.commission.amount } : {}),
    })),
    pix: t.pix,
    installment: t.installment,
    planCount: t.plan.count,
    planInstallment: t.plan.installment,
    discount: t.discount,
    removed: view.removedNotices.length,
  };
}

/** Remove um item pelo carrinho flutuante (só do carrinho atual desta loja). */
export async function removeMiniCartItemAction(slug: string, itemId: string): Promise<MiniCart | null> {
  const store = await getStore(slug);
  const token = await currentCartToken(store);
  if (!token || !/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const { cart } = await loadCart(slug, token);
  await removeItem(db, cart, itemId);
  await refreshCart(slug, token);
  return miniCartAction(slug);
}

export async function removeCartItemAction(slug: string, token: string, itemId: string) {
  const { cart } = await loadCart(slug, token);
  await removeItem(db, cart, itemId);
  await refreshCart(slug, token);
}

export async function acknowledgeNoticesAction(slug: string, token: string) {
  const { cart } = await loadCart(slug, token);
  await acknowledgeNotices(db, cart.id);
  await refreshCart(slug, token);
}

export async function changePaxAction(slug: string, token: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { cart } = await loadCart(slug, token);
    await db.transaction((tx) => changeItemPax(tx, cart, String(fd.get("itemId")), paxFrom(fd)));
  } catch (e) {
    const msg = userError(e);
    if (msg) return { error: msg };
    throw e;
  }
  await refreshCart(slug, token);
  return { ok: true, message: "Quantidades atualizadas com o preço do fornecedor" };
}

export async function applyCouponAction(slug: string, token: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { cart } = await loadCart(slug, token);
    const r = await db.transaction((tx) => applyCouponToCart(tx, cart, String(fd.get("code") ?? "")));
    await refreshCart(slug, token);
    return { ok: true, message: `Cupom ${r.coupon.code} aplicado${r.limitedByMargin ? " (desconto limitado ao máximo permitido)" : ""}` };
  } catch (e) {
    const msg = userError(e);
    if (msg) return { error: msg };
    throw e;
  }
}

export async function removeCouponAction(slug: string, token: string, layer: "SUBRINHO" | "AFFILIATE") {
  const { cart } = await loadCart(slug, token);
  await removeCouponFromCart(db, cart, layer);
  await refreshCart(slug, token);
}

/** Altera a margem do afiliado de UM item, somente neste carrinho (ADMIN da agência em modo ADMIN). */
export async function setMarginOverrideAction(slug: string, token: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { store, cart } = await loadCart(slug, token);
    const viewer = await viewerFor(store);
    if (!viewer || viewer.kind !== "AFFILIATE" || !viewer.adminMode) return { error: "Disponível apenas para o ADMIN da agência em modo ADMIN" };
    const reset = fd.get("reset") === "1";
    const raw = String(fd.get("marginPct") ?? "").replace(",", ".").trim();
    if (!reset && (raw === "" || !Number.isFinite(Number(raw)))) return { error: "Informe a margem em %" };
    if (!reset && Number(raw) < 0) return { error: "A margem não pode ser menor que 0%" };
    await setAffiliateMarginOverride(db, cart, String(fd.get("itemId")), reset ? null : raw, viewer.user);
    await recordAudit(db, {
      actor: { type: "AFFILIATE", id: viewer.user.id, name: viewer.user.name },
      affiliateId: store.id,
      action: "cart.margin_override",
      entity: "cart",
      entityId: cart.token,
      summary: reset ? "Restaurou a margem padrão de um item no carrinho" : `Alterou a margem de um item no carrinho para ${raw}%`,
      data: { itemId: String(fd.get("itemId")) },
    });
    await refreshCart(slug, token);
    return { ok: true, message: reset ? "Margem padrão restaurada" : "Margem alterada neste carrinho" };
  } catch (e) {
    const msg = userError(e);
    if (msg) return { error: msg };
    throw e;
  }
}

/** Registra o acesso ao carrinho (link compartilhado/checkout) e o torna o carrinho atual do visitante. */
export async function trackCartViewAction(slug: string, token: string, page: "cart" | "checkout") {
  const store = await getStore(slug);
  const cart = await getCartByToken(db, token, store.id);
  if (!cart) return;
  const viewer = await viewerFor(store);
  const meta = await requestMeta();
  await recordCartView(db, cart, {
    page,
    viewerType: viewer ? (viewer.kind === "CUSTOMER" ? "CUSTOMER" : "AFFILIATE") : null,
    viewerId: viewer ? (viewer.kind === "CUSTOMER" ? viewer.customer.id : viewer.user.id) : null,
    visitorId: await ensureVisitorId(),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  if (cart.status === "OPEN") await setCurrentCartToken(store, cart.token);
}

// ───────────── Contas ─────────────

const registerSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo"),
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")),
  phone: z.string().trim().min(8, "Informe um telefone"),
  document: z.string().trim().refine(isValidCpfOrCnpj, "CPF inválido"),
  birthDate: z.string().optional(),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
});

export async function customerRegisterAction(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const store = await getStore(slug);
  const parsed = registerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { ip } = await requestMeta();
  if (await registerBlocked(db, `register:${store.id}`, ip)) return { error: "Muitas contas criadas desta rede na última hora. Tente de novo mais tarde." };
  const [exists] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.affiliateId, store.id), eq(customers.email, parsed.data.email)));
  if (exists) return { error: "Já existe uma conta com este e-mail. Entre com sua senha ou use “Esqueci minha senha”." };
  await db.insert(loginAttempts).values({ scope: `register:${store.id}`, identifier: parsed.data.email, ip, success: true });
  const [c] = await db
    .insert(customers)
    .values({
      affiliateId: store.id,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      document: parsed.data.document,
      birthDate: parsed.data.birthDate || null,
      passwordHash: await hashPassword(parsed.data.password),
    })
    .returning();
  await endSession("loja");
  await startSession("loja", { userType: "CUSTOMER", userId: c.id, storeAffiliateId: store.id });
  redirect(await safeNext(store, str(fd.get("next"))));
}

export async function customerLoginAction(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const store = await getStore(slug);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const { ip } = await requestMeta();
  const scope = `loja:${store.id}`;
  const blocked = await loginBlocked(db, scope, email, ip);
  if (blocked) return { error: blocked };
  const [c] = await db.select().from(customers).where(and(eq(customers.affiliateId, store.id), eq(customers.email, email), isNull(customers.deletedAt)));
  const ok = !!c && (await verifyPassword(String(fd.get("password") ?? ""), c.passwordHash));
  await recordLogin(db, scope, email, ip, ok);
  if (!c || !ok) return { error: "E-mail ou senha incorretos" };
  await endSession("loja");
  await startSession("loja", { userType: "CUSTOMER", userId: c.id, storeAffiliateId: store.id });
  redirect(await safeNext(store, str(fd.get("next"))));
}

/** Login da agência na própria loja. ADMIN pode entrar em "modo ADMIN" (alterar margem no checkout). */
export async function agencyLoginAction(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const store = await getStore(slug);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const { ip } = await requestMeta();
  const blocked = await loginBlocked(db, "afiliado", email, ip);
  if (blocked) return { error: blocked };
  const [u] = await db.select().from(affiliateUsers).where(and(eq(affiliateUsers.email, email), eq(affiliateUsers.active, true)));
  const ok = !!u && (await verifyPassword(String(fd.get("password") ?? ""), u.passwordHash));
  await recordLogin(db, "afiliado", email, ip, ok);
  if (!u || !ok) return { error: "E-mail ou senha incorretos" };
  if (u.affiliateId !== store.id) return { error: "Este usuário não pertence a esta loja" };
  await endSession("loja");
  await startSession("loja", { userType: "AFFILIATE", userId: u.id, storeAffiliateId: store.id, adminMode: u.role === "ADMIN" && fd.get("adminMode") === "on" });
  redirect(await safeNext(store, str(fd.get("next"))));
}

export async function requestCustomerResetAction(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const store = await getStore(slug);
  const { ip } = await requestMeta();
  await requestPasswordReset(db, { realm: "loja", email: String(fd.get("email") ?? ""), ip, store });
  return { ok: true, message: RESET_SENT_MESSAGE };
}

export async function resetCustomerPasswordAction(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const store = await getStore(slug);
  let userId: string;
  try {
    userId = await resetPassword(db, { realm: "loja", token: String(fd.get("t") ?? ""), password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? ""), storeId: store.id });
  } catch (e) {
    if (e instanceof ResetError) return { error: e.message };
    throw e;
  }
  await endSession("loja");
  await startSession("loja", { userType: "CUSTOMER", userId, storeAffiliateId: store.id });
  redirect(await storePath(store, "/minha-conta"));
}

export async function deleteAccountAction(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const store = await getStore(slug);
  const viewer = await viewerFor(store);
  if (!viewer || viewer.kind !== "CUSTOMER") return { error: "Entre na sua conta" };
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "EXCLUIR") return { error: "Digite EXCLUIR para confirmar" };
  if (!(await verifyPassword(String(fd.get("password") ?? ""), viewer.customer.passwordHash))) return { error: "Senha incorreta" };
  await deleteCustomerAccount(db, viewer.customer.id);
  await endSession("loja");
  redirect(await storePath(store, "/?conta=excluida"));
}

export async function logoutAction(slug: string) {
  const store = await getStore(slug);
  await endSession("loja");
  redirect(await storePath(store));
}

export async function toggleAdminModeAction(slug: string) {
  const store = await getStore(slug);
  const v = await viewerFor(store);
  if (!v || v.kind !== "AFFILIATE" || !v.canAdmin) return;
  await setStoreAdminMode(v.sessionId, !v.adminMode);
  revalidateStore(store, "", "layout");
}

// ───────────── Checkout ─────────────

const personSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome completo do pagador"),
  document: z.string().trim().refine(isValidCpfOrCnpj, "CPF/CNPJ do pagador inválido"),
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail do pagador inválido")),
  phone: z.string().trim().optional(),
});

export async function placeOrderAction(slug: string, token: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store, cart } = await loadCart(slug, token);
  const viewer = await viewerFor(store);
  const meta = await requestMeta();
  let orderId: string;
  try {
    // Quem tem a conta
    let customer;
    if (viewer?.kind === "CUSTOMER") customer = viewer.customer;
    else if (viewer?.kind === "AFFILIATE") {
      const c = registerSchema.omit({ password: true }).safeParse({
        name: fd.get("customerName"),
        email: fd.get("customerEmail"),
        phone: fd.get("customerPhone"),
        document: fd.get("customerDocument"),
        birthDate: fd.get("customerBirthDate") ?? undefined,
      });
      if (!c.success) return { error: `Cliente: ${c.error.issues[0].message}` };
      customer = (await findOrCreateCustomer(db, store.id, c.data)).customer;
    } else return { error: "Entre ou crie sua conta para finalizar" };

    // Quem paga
    const same = fd.get("payerSame") === "on";
    const payerRaw = same
      ? { name: customer.name, document: customer.document ?? "", email: customer.email, phone: customer.phone ?? undefined }
      : { name: fd.get("payerName"), document: fd.get("payerDocument"), email: fd.get("payerEmail"), phone: fd.get("payerPhone") ?? undefined };
    const payerParsed = personSchema.safeParse(payerRaw);
    if (!payerParsed.success) return { error: payerParsed.error.issues[0].message };
    const address = {
      zip: str(fd.get("zip")),
      street: str(fd.get("street")),
      number: str(fd.get("number")),
      complement: str(fd.get("complement")),
      district: str(fd.get("district")),
      city: str(fd.get("city")),
      state: str(fd.get("state")),
    };
    const payer: PersonData = {
      ...payerParsed.data,
      document: payerParsed.data.document,
      address: Object.values(address).some(Boolean) ? { ...address, country: "BR" } : null,
    };

    // Viajantes (adultos primeiro, depois crianças — é a ordem usada na reserva do hotel)
    const names = fd.getAll("travelerName").map(String);
    const docs = fd.getAll("travelerDocument").map(String);
    const births = fd.getAll("travelerBirthDate").map(String);
    const types = fd.getAll("travelerType").map(String);
    const titles = fd.getAll("travelerTitle").map(String);
    const agesIn = fd.getAll("travelerAge").map(String);
    const travelers: PersonData[] = names
      .map((n, i): PersonData => {
        const type = types[i] === "CHILD" ? "CHILD" : "ADULT";
        const title = titles[i] === "MRS" ? "MRS" : titles[i] === "MR" ? "MR" : undefined;
        const age = agesIn[i] !== undefined && agesIn[i] !== "" ? Number(agesIn[i]) : undefined;
        return {
          name: n.trim().replace(/\s+/g, " "),
          type,
          ...(title ? { title } : {}),
          ...(type === "CHILD" && Number.isInteger(age) ? { age } : {}),
          document: docs[i]?.trim() || null,
          birthDate: births[i] || null,
        };
      })
      .filter((t) => t.name);
    if (!travelers.length) return { error: "Informe ao menos o nome do viajante principal" };
    const activeItems = await db
      .select({ category: cartItems.category, pax: cartItems.pax })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.status, "ACTIVE")));
    const hotelError = hotelGuestsError(activeItems, travelers);
    if (hotelError) return { error: hotelError };

    const method = fd.get("paymentMethod") === "CARD" ? "CARD" : "PIX";
    // PayPal: o cartão é digitado no PayPal (página do pedido), não aqui
    const card =
      method === "CARD" && paymentProvider().cardCheckout === "inline"
        ? {
            holder: String(fd.get("cardHolder") ?? "").trim(),
            number: onlyDigits(String(fd.get("cardNumber") ?? "")),
            expiry: String(fd.get("cardExpiry") ?? ""),
            cvv: String(fd.get("cardCvv") ?? ""),
            installments: int(fd.get("installments"), 1),
          }
        : undefined;
    if (card && (card.holder.length < 3 || card.number.length < 13 || !/^\d{2}\/\d{2}$/.test(card.expiry) || card.cvv.length < 3))
      return { error: "Confira os dados do cartão" };

    const res = await db.transaction((tx) =>
      placeOrder(tx, {
        cart,
        customer,
        payer,
        travelers,
        paymentMethod: method,
        installments: int(fd.get("installments"), 1),
        card,
        placedByAffiliateUserId: viewer.kind === "AFFILIATE" ? viewer.user.id : null,
        specialRequests: str(fd.get("specialRequests")) ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent,
      }),
    );
    if ("declined" in res && res.declined) return { error: `${res.declined}. Tente outro cartão ou pague no Pix.` };
    orderId = res.order.id;
    // Cartão aprovado: emite as reservas dos fornecedores reais depois da resposta (se habilitado).
    if (res.approved) {
      const paidId = res.order.id;
      after(() => autoIssueOrder(paidId));
    }

    // Cliente que comprou fica logado na loja (para acompanhar o pedido).
    if (viewer.kind === "AFFILIATE") {
      /* a agência continua logada */
    }
  } catch (e) {
    const msg = userError(e);
    if (msg) {
      await refreshCart(slug, token);
      return { error: msg };
    }
    throw e;
  }
  await refreshCart(slug, token);
  redirect(await storePath(store, `/pedido/${orderId}`));
}

/** Hotéis: nome e sobrenome de todos os hóspedes (adultos e crianças) de cada quarto. */
function hotelGuestsError(items: { category: string; pax: PaxConfig }[], travelers: PersonData[]): string | null {
  if (items.some((i) => i.category === "HOUSES")) {
    const lead = travelers.find((t) => t.type !== "CHILD" && t.name.trim());
    if (!lead || lead.name.split(" ").filter(Boolean).length < 2) return "Informe nome e sobrenome do hóspede responsável pela casa (exigência da administradora)";
  }
  const hotels = items.filter((i) => i.category === "LODGING");
  if (!hotels.length) return null;
  const adults = travelers.filter((t) => t.type !== "CHILD");
  const children = travelers.filter((t) => t.type === "CHILD");
  const needAdults = Math.max(...hotels.map((h) => h.pax.adults ?? 0));
  const needChildren = Math.max(...hotels.map((h) => h.pax.children ?? 0));
  if (adults.length < needAdults) return `Informe o nome dos ${needAdults} adultos da hospedagem`;
  if (children.length < needChildren) return `Informe o nome das ${needChildren} crianças da hospedagem`;
  const incomplete = [...adults.slice(0, needAdults), ...children.slice(0, needChildren)].find((t) => t.name.split(" ").filter(Boolean).length < 2);
  if (incomplete) return `Informe nome e sobrenome de “${incomplete.name}” (exigência do hotel)`;
  return null;
}

// ───────────── PayPal (botões na página do pedido) ─────────────

/** Pedido desta loja que quem está vendo pode pagar (cliente dono ou equipe da agência). */
async function payableOrder(slug: string, orderId: string, accessKey?: string | null) {
  const store = await getStore(slug);
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new CheckoutError("Pedido não encontrado");
  const viewer = await viewerFor(store);
  // link do e-mail do pedido (?k=) também permite pagar este pedido
  const byLink = validOrderAccessKey(orderId, accessKey);
  if (!viewer && !byLink) throw new CheckoutError("Entre na sua conta para pagar");
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.affiliateId, store.id)));
  if (!o || (!byLink && viewer?.kind === "CUSTOMER" && o.customerId !== viewer.customer.id)) throw new CheckoutError("Pedido não encontrado");
  return { store, order: o };
}

/** Cria (ou reaproveita) o pedido no PayPal — o valor vem do nosso banco, nunca do navegador. */
export async function startPaypalAction(slug: string, orderId: string, accessKey?: string | null): Promise<{ id?: string; error?: string }> {
  try {
    const { store, order } = await payableOrder(slug, orderId, accessKey);
    return { id: await createPaypalCheckout(db, order, { brandName: store.name }) };
  } catch (e) {
    const msg = userError(e);
    if (!msg) console.error("[paypal] criar pedido:", e instanceof Error ? e.message : e);
    return { error: msg ?? "Não conseguimos abrir o PayPal agora. Tente novamente em instantes." };
  }
}

/** Captura depois da aprovação no PayPal; `retry` = o PayPal deixa escolher outro meio na mesma janela. */
export async function capturePaypalAction(slug: string, orderId: string, paypalOrderId: string, accessKey?: string | null): Promise<{ ok?: boolean; retry?: boolean; pending?: boolean; message?: string; error?: string }> {
  try {
    const { store, order } = await payableOrder(slug, orderId, accessKey);
    const r = await capturePaypalCheckout(db, order, String(paypalOrderId).slice(0, 64));
    revalidateStore(store, `/pedido/${orderId}`);
    if (r.state === "PAID") {
      after(() => autoIssueOrder(orderId));
      return { ok: true };
    }
    if (r.state === "RETRY") return { retry: true, message: r.message };
    if (r.state === "PENDING") return { pending: true, message: r.message };
    return { error: r.message };
  } catch (e) {
    const msg = userError(e);
    if (!msg) console.error("[paypal] captura:", e instanceof Error ? e.message : e);
    return { error: msg ?? "Não conseguimos confirmar o pagamento agora. Se o valor foi debitado, o pedido é confirmado automaticamente em instantes." };
  }
}

/** Somente em ambiente de testes (PAYMENT_PROVIDER=mock): simula a confirmação do Pix. */
export async function simulatePixPaymentAction(slug: string, orderId: string) {
  if (!isMockPayments()) throw new Error("Disponível apenas no ambiente de testes");
  const store = await getStore(slug);
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.affiliateId, store.id)));
  if (!o || o.status !== "PENDING_PAYMENT") return;
  await db.transaction((tx) => markOrderPaid(tx, o.id, { paidAt: new Date(), ref: o.paymentRef, data: { simulated: true } }));
  revalidateStore(store, `/pedido/${orderId}`);
}

// ───────────── Adicionar rápido (cards da vitrine) ─────────────

/** Sugestões do carrinho ("Complete sua viagem"): o que combina com o item mais recente. */
export async function crossSellAction(slug: string): Promise<CrossSell | null> {
  const store = await getStore(slug);
  return crossSellFor(store).catch((e) => {
    console.error("[sugestões] falhou:", e instanceof Error ? e.message : e);
    return null;
  });
}

export type QuickInput = { date?: string; checkin?: string; checkout?: string; adults: number; children: number; ages?: number[]; rooms?: number };
export type QuickPrice = { pix: string; installment: string; planCount: number; planInstallment: string };
export type QuickOption = {
  /** Referência neutra para adicionar (o hotel pode ter a opção em outro fornecedor). */
  ref: string;
  optionId: string;
  title: string;
  subtitle: string | null;
  /** Preço de referência: por adulto (ingresso) ou da estadia inteira (hotel/casa). */
  pix: string;
  installment: string;
  per: "adult" | "stay";
  /** Ingresso: preço de 1 criança (null = sem preço de criança informado). */
  childPix?: string | null;
  /** Total para as datas e pessoas escolhidas (null = não deu para calcular aqui; o carrinho confirma). */
  total: QuickPrice | null;
  /** false = o total não inclui as crianças (o fornecedor não informa o preço delas antes de cotar). */
  totalComplete: boolean;
  freeCancel: boolean;
  available: boolean;
  /** Hotel: primeira foto do tipo de quarto (servida pela loja). */
  photo?: string | null;
  /** Só para o ADMIN da agência (sobre o total). */
  commission?: string;
};

/** Opções e preços de um produto para as datas/pessoas escolhidas no adicionar rápido. */
export async function quickOptionsAction(slug: string, ref: string, input: QuickInput): Promise<{ options: QuickOption[]; error?: string }> {
  const store = await getStore(slug);
  const target = parseProductRef(ref);
  if (!target) return { options: [], error: "Produto indisponível" };
  const adapter = getAdapter(target.supplierCode);
  const kind = adapter.category === "TICKETS" ? "tickets" : adapter.category === "LODGING" ? "lodging" : adapter.category === "HOUSES" ? "houses" : null;
  if (!kind) return { options: [], error: "Abra a página do produto para escolher" };
  const ages = (input.ages ?? []).slice(0, input.children);
  const { d } = parseSearch({
    data: input.date,
    checkin: input.checkin,
    checkout: input.checkout,
    adultos: String(input.adults),
    criancas: String(input.children),
    quartos: String(input.rooms ?? 1),
    idades: ages.join(","),
  });
  const [ctx, reveal] = await Promise.all([getStorePricing(store.id), storeInsight(store.id)]);
  try {
    const p = await getProductDetail(db, ctx, target.supplierCode, target.productId, supplierParams(d, kind), { reveal });
    if (!p) return { options: [], error: "Sem disponibilidade para estas datas" };
    const price = (x: { pix: { toString(): string }; installment: { toString(): string }; plan: { count: number; installment: { toString(): string } } }): QuickPrice => ({
      pix: x.pix.toString(),
      installment: x.installment.toString(),
      planCount: x.plan.count,
      planInstallment: x.plan.installment.toString(),
    });
    const scale = <L extends { quantity: number }>(lines: L[], q: number) => lines.map((l) => ({ ...l, quantity: l.quantity * q })).filter((l) => l.quantity > 0);
    const options = p.options
      .filter((o) => o.price)
      .map((o): QuickOption => {
        const target = { category: p.category, supplierCode: o.supplierCode, productId: o.productId, optionId: o.optionId };
        let total = price(o.price!);
        let commission = o.price!.commission?.amount.toString();
        let childPix: string | null = null;
        let totalComplete = true;
        if (kind === "tickets") {
          // ingresso: o preço da vitrine é de 1 adulto; aqui o total é para as pessoas escolhidas
          const childLines = o.childLines?.length ? o.childLines : null;
          try {
            childPix = childLines ? quoteDisplayPrice(ctx, target, o.currency, childLines, null).pix.toString() : null;
          } catch {
            childPix = null;
          }
          totalComplete = !d.criancas || !!childLines;
          const lines = [...scale(o.lines, d.adultos), ...(childLines ? scale(childLines, d.criancas) : [])];
          try {
            if (lines.length) {
              const t = quoteDisplayPrice(ctx, target, o.currency, lines, o.minSellPrice ?? null, { commission: reveal.commission });
              total = price(t);
              commission = t.commission?.amount.toString();
            }
          } catch {
            /* mantém o preço de 1 adulto */
          }
        }
        return {
          ref: productRef(o.supplierCode, o.productId),
          optionId: o.optionId,
          title: o.title,
          subtitle: (kind === "lodging" ? (o.attributes?.find((a) => a.label === "Regime")?.value ?? o.description) : o.description) ?? null,
          pix: o.price!.pix.toString(),
          installment: o.price!.installment.toString(),
          per: kind === "tickets" ? "adult" : "stay",
          childPix,
          total,
          totalComplete,
          freeCancel: !!o.freeCancellationUntil,
          available: o.available,
          photo: kind === "lodging" ? (o.room?.photos?.[0] ?? null) : null,
          ...(commission ? { commission } : {}),
        };
      })
      // do mais barato ao mais caro (disponíveis primeiro)
      .sort((a, b) => Number(b.available) - Number(a.available) || Number(a.total?.pix ?? a.pix) - Number(b.total?.pix ?? b.pix));
    return options.length ? { options } : { options: [], error: kind === "lodging" ? "Sem quartos para estas datas e hóspedes" : "Sem disponibilidade para estas datas" };
  } catch (e) {
    return { options: [], error: userError(e) ?? "Não foi possível consultar agora. Tente de novo." };
  }
}
