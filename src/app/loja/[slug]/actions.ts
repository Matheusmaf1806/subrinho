"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { affiliateUsers, customers, orders, type PaxConfig, type PersonData } from "@/server/db/schema";
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
import { isMockPayments } from "@/server/payments/provider";
import { PricingError } from "@/server/pricing/engine";
import { getAdapter } from "@/server/suppliers/registry";
import { SupplierError } from "@/server/suppliers/types";
import type { ActionState } from "@/components/ui-client";
import { isValidCpfOrCnpj, onlyDigits } from "@/lib/br";
import { actorOf, currentCartToken, getStore, safeNext, setCurrentCartToken, storePath, viewerFor } from "./_lib/store";

const userError = (e: unknown): string | null =>
  e instanceof CartError || e instanceof CheckoutError || e instanceof SupplierError || e instanceof PricingError ? e.message : null;

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
  return pax;
}

async function loadCart(slug: string, token: string) {
  const store = await getStore(slug);
  const cart = await getCartByToken(db, token, store.id);
  if (!cart) throw new CartError("Carrinho não encontrado");
  return { store, cart };
}

function refreshCart(slug: string, token: string) {
  revalidatePath(`/loja/${slug}/carrinho/${token}`);
  revalidatePath(`/loja/${slug}/checkout/${token}`);
  revalidatePath(`/loja/${slug}`, "layout");
}

// ───────────── Carrinho ─────────────

export async function addToCartAction(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const store = await getStore(slug);
  const viewer = await viewerFor(store);
  let token: string;
  try {
    const supplier = String(fd.get("supplier") ?? "");
    const adapter = getAdapter(supplier);
    const quote = await adapter.quote({
      productId: String(fd.get("productId") ?? ""),
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
      await addQuoteToCart(tx, c, quote);
      return c;
    });
    await setCurrentCartToken(store, cart.token);
    token = cart.token;
  } catch (e) {
    const msg = userError(e) ?? (e instanceof Error && e.message.startsWith("Fornecedor desconhecido") ? "Produto indisponível" : null);
    if (msg) return { error: msg };
    throw e;
  }
  revalidatePath(`/loja/${slug}`, "layout");
  redirect(storePath(store, `/carrinho/${token}?adicionado=1`));
}

export async function removeCartItemAction(slug: string, token: string, itemId: string) {
  const { cart } = await loadCart(slug, token);
  await removeItem(db, cart, itemId);
  refreshCart(slug, token);
}

export async function acknowledgeNoticesAction(slug: string, token: string) {
  const { cart } = await loadCart(slug, token);
  await acknowledgeNotices(db, cart.id);
  refreshCart(slug, token);
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
  refreshCart(slug, token);
  return { ok: true, message: "Quantidades atualizadas com o preço do fornecedor" };
}

export async function applyCouponAction(slug: string, token: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { cart } = await loadCart(slug, token);
    const r = await db.transaction((tx) => applyCouponToCart(tx, cart, String(fd.get("code") ?? "")));
    refreshCart(slug, token);
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
  refreshCart(slug, token);
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
    refreshCart(slug, token);
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
  const [exists] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.affiliateId, store.id), eq(customers.email, parsed.data.email)));
  if (exists) return { error: "Já existe uma conta com este e-mail. Entre com sua senha." };
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
  redirect(safeNext(store, str(fd.get("next"))));
}

export async function customerLoginAction(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const store = await getStore(slug);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const [c] = await db.select().from(customers).where(and(eq(customers.affiliateId, store.id), eq(customers.email, email)));
  if (!c || !(await verifyPassword(String(fd.get("password") ?? ""), c.passwordHash))) return { error: "E-mail ou senha incorretos" };
  await endSession("loja");
  await startSession("loja", { userType: "CUSTOMER", userId: c.id, storeAffiliateId: store.id });
  redirect(safeNext(store, str(fd.get("next"))));
}

/** Login da agência na própria loja. ADMIN pode entrar em "modo ADMIN" (alterar margem no checkout). */
export async function agencyLoginAction(slug: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const store = await getStore(slug);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const [u] = await db.select().from(affiliateUsers).where(and(eq(affiliateUsers.email, email), eq(affiliateUsers.active, true)));
  if (!u || !(await verifyPassword(String(fd.get("password") ?? ""), u.passwordHash))) return { error: "E-mail ou senha incorretos" };
  if (u.affiliateId !== store.id) return { error: "Este usuário não pertence a esta loja" };
  await endSession("loja");
  await startSession("loja", { userType: "AFFILIATE", userId: u.id, storeAffiliateId: store.id, adminMode: u.role === "ADMIN" && fd.get("adminMode") === "on" });
  redirect(safeNext(store, str(fd.get("next"))));
}

export async function logoutAction(slug: string) {
  const store = await getStore(slug);
  await endSession("loja");
  redirect(storePath(store));
}

export async function toggleAdminModeAction(slug: string) {
  const store = await getStore(slug);
  const v = await viewerFor(store);
  if (!v || v.kind !== "AFFILIATE" || !v.canAdmin) return;
  await setStoreAdminMode(v.sessionId, !v.adminMode);
  revalidatePath(`/loja/${slug}`, "layout");
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
    const payer: PersonData = {
      ...payerParsed.data,
      document: payerParsed.data.document,
      address: {
        zip: str(fd.get("zip")),
        street: str(fd.get("street")),
        number: str(fd.get("number")),
        complement: str(fd.get("complement")),
        district: str(fd.get("district")),
        city: str(fd.get("city")),
        state: str(fd.get("state")),
        country: "BR",
      },
    };

    // Viajantes
    const names = fd.getAll("travelerName").map(String);
    const docs = fd.getAll("travelerDocument").map(String);
    const births = fd.getAll("travelerBirthDate").map(String);
    const travelers: PersonData[] = names
      .map((n, i) => ({ name: n.trim(), document: docs[i]?.trim() || null, birthDate: births[i] || null }))
      .filter((t) => t.name);
    if (!travelers.length) return { error: "Informe ao menos o nome do viajante principal" };

    const method = fd.get("paymentMethod") === "CARD" ? "CARD" : "PIX";
    const card =
      method === "CARD"
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
        ip: meta.ip,
        userAgent: meta.userAgent,
      }),
    );
    if ("declined" in res && res.declined) return { error: `${res.declined}. Tente outro cartão ou pague no Pix.` };
    orderId = res.order.id;

    // Cliente que comprou fica logado na loja (para acompanhar o pedido).
    if (viewer.kind === "AFFILIATE") {
      /* a agência continua logada */
    }
  } catch (e) {
    const msg = userError(e);
    if (msg) {
      refreshCart(slug, token);
      return { error: msg };
    }
    throw e;
  }
  refreshCart(slug, token);
  redirect(storePath(store, `/pedido/${orderId}`));
}

/** Somente em ambiente de testes (PAYMENT_PROVIDER=mock): simula a confirmação do Pix. */
export async function simulatePixPaymentAction(slug: string, orderId: string) {
  if (!isMockPayments()) throw new Error("Disponível apenas no ambiente de testes");
  const store = await getStore(slug);
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.affiliateId, store.id)));
  if (!o || o.status !== "PENDING_PAYMENT") return;
  await db.transaction((tx) => markOrderPaid(tx, o.id, { paidAt: new Date(), ref: o.paymentRef, data: { simulated: true } }));
  revalidatePath(storePath(store, `/pedido/${orderId}`));
}
