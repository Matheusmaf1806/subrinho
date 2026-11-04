/**
 * Dados de demonstração, criados pelos próprios serviços (mesmas regras de produção).
 *
 * Acessos:
 *   Painel Subrinho  → /subrinho/login   admin@subrinho.com.br      / subrinho123
 *   Painel Afiliado  → /afiliado/login   ana@viagensdaana.com.br    / afiliado123  (ADMIN)
 *                                         bruno@viagensdaana.com.br  / afiliado123  (AGENT)
 *   Loja             → /loja/viagens-da-ana  maria@cliente.com.br   / cliente123
 */
import "./env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db";
import { cartItems, carts, cartViews, holidays, orders, settings, suppliers } from "../src/server/db/schema";
import { createAffiliate, createAffiliateUser, createSubrinhoUser } from "../src/server/admin/affiliates";
import { upsertMarginRule } from "../src/server/admin/margins";
import { createCoupon } from "../src/server/admin/coupons";
import { recordFxRate } from "../src/server/fx";
import { updateBranding } from "../src/server/admin/branding";
import { files } from "../src/server/db/schema";
import { readFileSync } from "node:fs";
import { photo } from "../src/lib/images";
import { DEFAULT_SETTINGS } from "../src/server/settings";
import { SUPPLIERS, getAdapter } from "../src/server/suppliers/registry";
import { addQuoteToCart, applyCouponToCart, createCart, recordCartView, type CartActor } from "../src/server/cart/service";
import { findOrCreateCustomer, markOrderPaid, placeOrder } from "../src/server/checkout/service";
import { attachPayoutProof, closeFortnight, markPayoutPaid } from "../src/server/payouts/service";
import { fortnightOf } from "../src/server/payouts/calendar";
import { addDays, todayLocal } from "../src/lib/tz";
import type { QuoteRequest } from "../src/server/suppliers/types";

// Os dados de demonstração usam sempre o catálogo simulado (nunca as APIs reais dos fornecedores).
process.env.SUPPLIERS_MODE = "mock";

const db = getDb();
const today = todayLocal();
const future = (n: number) => addDays(today, n);
const at = (date: string, time = "14:00") => new Date(`${date}T${time}:00-03:00`);

const [already] = await db.select().from(suppliers).limit(1);
if (already) {
  console.log("Banco já possui dados — rode `npm run db:reset` para recriar.");
  await closeDb();
  process.exit(0);
}

// ───────── Configuração base ─────────
await db.insert(suppliers).values(SUPPLIERS.map((s) => ({ ...s })));
await db.insert(settings).values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value: value as never })));
await recordFxRate(db, { currency: "USD", rate: "4.93", source: "poolvo" });
await recordFxRate(db, { currency: "EUR", rate: "5.38", source: "poolvo" });
await db.insert(holidays).values([
  { date: "2026-01-25", name: "Aniversário de São Paulo" },
  { date: "2026-07-09", name: "Revolução Constitucionalista (SP)" },
  { date: "2027-01-25", name: "Aniversário de São Paulo" },
  { date: "2027-07-09", name: "Revolução Constitucionalista (SP)" },
]);

const owner = await createSubrinhoUser(db, { name: "Equipe Subrinho", email: "admin@subrinho.com.br", password: "subrinho123", role: "OWNER" });
await createSubrinhoUser(db, { name: "Financeiro Subrinho", email: "financeiro@subrinho.com.br", password: "subrinho123", role: "FINANCE" });

// Margens Subrinho
for (const r of [
  { scope: "DEFAULT" as const, marginPct: "4.5", label: "Padrão Subrinho" },
  { scope: "CATEGORY" as const, category: "LODGING" as const, marginPct: "5", label: "Hospedagem" },
  { scope: "CATEGORY" as const, category: "INSURANCE" as const, marginPct: "12", label: "Seguro Viagem" },
  { scope: "CATEGORY" as const, category: "CHIP" as const, marginPct: "15", label: "Chip" },
  { scope: "SUPPLIER" as const, supplierCode: "HOTELBEDS", marginPct: "5.5", label: "Hotelbeds" },
]) {
  await upsertMarginRule(db, { owner: "SUBRINHO", ...r }, owner.id);
}

// ───────── Afiliados ─────────
const ana = await createAffiliate(
  db,
  {
    name: "Viagens da Ana",
    slug: "viagens-da-ana",
    legalName: "Ana Souza Turismo LTDA",
    document: "12.345.678/0001-90",
    email: "contato@viagensdaana.com.br",
    phone: "(11) 3333-4444",
    whatsapp: "5511999990000",
    brandColor: "#E4113F",
    pixKey: "12.345.678/0001-90",
    bankName: "Banco do Brasil",
    bankAgency: "1234-5",
    bankAccount: "98765-4",
  },
  { name: "Ana Souza", email: "ana@viagensdaana.com.br", password: "afiliado123" },
);
const bruno = await createAffiliateUser(db, ana.id, { name: "Bruno Lima", email: "bruno@viagensdaana.com.br", password: "afiliado123", role: "AGENT" });
const [anaAdmin] = await db.query.affiliateUsers.findMany({ where: (u, { eq }) => eq(u.email, "ana@viagensdaana.com.br") });

const rota = await createAffiliate(
  db,
  { name: "Rota Brasil Turismo", slug: "rota-brasil", email: "contato@rotabrasil.com.br", brandColor: "#0F766E", pixKey: "contato@rotabrasil.com.br" },
  { name: "Carlos Rocha", email: "carlos@rotabrasil.com.br", password: "afiliado123" },
);

// ───────── White-label: cada loja com a sua identidade ─────────
async function publicAsset(path: string, filename: string) {
  const data = readFileSync(path);
  const [f] = await db.insert(files).values({ filename, mimeType: "image/png", size: data.length, data, isPublic: true, uploadedByType: "SUBRINHO", uploadedById: owner.id }).returning({ id: files.id });
  return `/api/public/files/${f.id}`;
}
await updateBranding(db, ana.id, {
  brandColor: "#E4113F", darkColor: "#0A0A0B", fontFamily: "inter-tight",
  logoUrl: null, logoOnDarkUrl: null, faviconUrl: null,
  heroTitle: "Viaje mais.\nPague em 10x.", heroSubtitle: null,
  heroImageUrl: photo("heroWoman", 1200, 1500), heroImage2Url: photo("travelerCity", 900, 1000),
  tagline: "Viajar com a Ana é viajar com quem entende.", instagram: "viagensdaana", showPoweredBy: true,
});
await updateBranding(db, rota.id, {
  brandColor: "#0F766E", darkColor: "#0B2B26", fontFamily: "manrope",
  logoUrl: null, logoOnDarkUrl: null, faviconUrl: null,
  heroTitle: "O mundo\ncomeça aqui.", heroSubtitle: "Pacotes, hotéis e ingressos com o cuidado da Rota Brasil — atendimento de segunda a sábado.",
  heroImageUrl: photo("travelerHiker", 1200, 1500), heroImage2Url: photo("lisbon", 900, 1000),
  tagline: "Rota Brasil Turismo — viajando com você desde 2009.", instagram: "rotabrasil", showPoweredBy: true,
});
const solemar = await createAffiliate(
  db,
  { name: "Sol & Mar Viagens", slug: "sol-e-mar", email: "ola@solemar.com.br", phone: "(81) 3222-1100", whatsapp: "5581988887777", pixKey: "ola@solemar.com.br" },
  { name: "Marina Costa", email: "marina@solemar.com.br", password: "afiliado123" },
);
await updateBranding(db, solemar.id, {
  brandColor: "#FFC531", darkColor: "#10214A", fontFamily: "fraunces",
  logoUrl: await publicAsset("scripts/seed-assets/sol-e-mar-logo.png", "sol-e-mar-logo.png"),
  logoOnDarkUrl: await publicAsset("scripts/seed-assets/sol-e-mar-logo-dark.png", "sol-e-mar-logo-dark.png"),
  faviconUrl: null,
  heroTitle: "O verão\nnunca acaba.", heroSubtitle: "Resorts, casas com piscina e ingressos para curtir o ano inteiro — no Pix ou em 10x.",
  heroImageUrl: photo("infinityPool", 1200, 1500), heroImage2Url: photo("tropicalResort", 900, 1000),
  tagline: "Praia, sol e viagens sem preocupação.", instagram: "solemarviagens", showPoweredBy: false,
});
await upsertMarginRule(db, { owner: "AFFILIATE", affiliateId: solemar.id, scope: "DEFAULT", marginPct: "6", label: "Padrão" }, owner.id);

for (const r of [
  { scope: "DEFAULT" as const, marginPct: "3.7", label: "Padrão" },
  { scope: "CATEGORY" as const, category: "TICKETS" as const, marginPct: "8", label: "Ingressos" },
  { scope: "CATEGORY" as const, category: "LODGING" as const, marginPct: "6", label: "Hospedagem" },
  { scope: "CATEGORY" as const, category: "HOUSES" as const, marginPct: "7", label: "Casas" },
  { scope: "PRODUCT" as const, category: "TICKETS" as const, supplierCode: "TU_EXPERIENZA", productId: "colosseo", marginPct: "10", label: "Coliseu, Fórum Romano e Palatino" },
  { scope: "PRODUCT_OPTION" as const, category: "TICKETS" as const, supplierCode: "TU_EXPERIENZA", productId: "colosseo", optionId: "colosseo-vaticano", marginPct: "12", label: "Coliseu + Vaticano" },
  { scope: "PRODUCT" as const, category: "TICKETS" as const, supplierCode: "NADIO", productId: "disney-mk", marginPct: "6", label: "Walt Disney World" },
]) {
  await upsertMarginRule(db, { owner: "AFFILIATE", affiliateId: ana.id, ...r }, anaAdmin.id);
}
await upsertMarginRule(db, { owner: "AFFILIATE", affiliateId: rota.id, scope: "DEFAULT", marginPct: "5", label: "Padrão" }, anaAdmin.id);

// Cupons
await createCoupon(db, "SUBRINHO", { code: "BEMVINDO5", description: "5% em hospedagem (campanha Subrinho)", discountType: "PERCENT", percentOff: "5", maxDiscount: "300", categories: ["LODGING"] }, { type: "SUBRINHO", id: owner.id });
await createCoupon(db, "AFFILIATE", { code: "ANA100", description: "R$ 100 a cada R$ 10.000", discountType: "CONDITIONAL", amountOff: "100", stepAmount: "10000" }, { type: "AFFILIATE", id: anaAdmin.id, affiliateId: ana.id });
await createCoupon(db, "AFFILIATE", { code: "INGRESSO10", description: "10% em ingressos", discountType: "PERCENT", percentOff: "10", categories: ["TICKETS"] }, { type: "AFFILIATE", id: anaAdmin.id, affiliateId: ana.id });
await createCoupon(db, "AFFILIATE", { code: "ROTA50", description: "R$ 50 de desconto", discountType: "FIXED", amountOff: "50", minSubtotal: "1500" }, { type: "AFFILIATE", id: rota.id, affiliateId: rota.id });

// Clientes
const { customer: maria } = await findOrCreateCustomer(db, ana.id, { name: "Maria Oliveira", email: "maria@cliente.com.br", phone: "(11) 98888-1111", document: "123.456.789-09", birthDate: "1988-04-12", password: "cliente123" });
const { customer: joao } = await findOrCreateCustomer(db, ana.id, { name: "João Pereira", email: "joao@cliente.com.br", phone: "(21) 97777-2222", document: "987.654.321-00", password: "cliente123" });
const { customer: lucia } = await findOrCreateCustomer(db, rota.id, { name: "Lúcia Santos", email: "lucia@cliente.com.br", phone: "(31) 96666-3333", document: "111.222.333-96", password: "cliente123" });

// ───────── Carrinhos e pedidos ─────────
async function buildCart(affiliateId: string, actor: CartActor, quotes: { supplier: string; req: QuoteRequest }[], createdAt: Date, views: number) {
  const cart = await createCart(db, affiliateId, actor);
  for (const q of quotes) await addQuoteToCart(db, cart, await getAdapter(q.supplier).quote(q.req));
  await db.update(carts).set({ createdAt, updatedAt: createdAt }).where(eq(carts.id, cart.id));
  for (let i = 0; i < views; i++) {
    await recordCartView(db, cart, { page: i % 3 === 0 ? "checkout" : "cart", visitorId: `seed-${i % 2}`, viewerType: i % 2 ? "CUSTOMER" : null, userAgent: "seed" });
  }
  await db.update(cartViews).set({ viewedAt: new Date(createdAt.getTime() + 3600_000) }).where(eq(cartViews.cartId, cart.id));
  const [fresh] = await db.select().from(carts).where(eq(carts.id, cart.id));
  return fresh;
}

async function sell(opts: {
  cart: Awaited<ReturnType<typeof buildCart>>;
  customer: typeof maria;
  payer?: { name: string; document: string; email: string };
  method: "PIX" | "CARD";
  paidAt: Date;
  placedBy?: string;
}) {
  const payer = opts.payer ?? { name: opts.customer.name, document: opts.customer.document ?? "", email: opts.customer.email };
  const res = await placeOrder(db, {
    cart: opts.cart,
    customer: opts.customer,
    payer: { ...payer, phone: opts.customer.phone },
    travelers: [{ name: opts.customer.name, document: opts.customer.document }],
    paymentMethod: opts.method,
    installments: 10,
    card: opts.method === "CARD" ? { holder: payer.name.toUpperCase(), number: "4111111111111111", expiry: "12/30", cvv: "123", installments: 10 } : undefined,
    placedByAffiliateUserId: opts.placedBy ?? null,
    revalidate: false,
    now: opts.paidAt,
    userAgent: "seed",
  });
  let order = res.order;
  if (opts.method === "PIX") order = await markOrderPaid(db, order.id, { paidAt: opts.paidAt, ref: order.paymentRef });
  await db.update(orders).set({ createdAt: new Date(opts.paidAt.getTime() - 20 * 60000) }).where(eq(orders.id, order.id));
  return order;
}

// Pedido 1 — 1ª quinzena de outubro: Roma (Coliseu + Vaticano com criança) + hotel, PIX, pagador diferente
const c1 = await buildCart(ana.id, { type: "AFFILIATE", id: bruno.id }, [
  { supplier: "TU_EXPERIENZA", req: { productId: "colosseo", optionId: "colosseo-vaticano", date: future(40), pax: { adults: 2, children: 1 } } },
  { supplier: "HOTELBEDS", req: { productId: "hotelbeds-rom-trevi", optionId: "dbl-bb", checkIn: future(38), checkOut: future(43), pax: { adults: 2, children: 0, rooms: 1 } } },
], at("2026-10-02", "10:15"), 7);
await sell({ cart: c1, customer: maria, payer: { name: "Carlos Oliveira", document: "321.654.987-91", email: "carlos.oliveira@email.com" }, method: "PIX", paidAt: at("2026-10-05", "16:40"), placedBy: bruno.id });

// Pedido 2 — 1ª quinzena: Disney 4 dias (2 adultos + 2 crianças) + casa, cartão 10x
const c2 = await buildCart(ana.id, { type: "CUSTOMER", id: joao.id }, [
  { supplier: "NADIO", req: { productId: "disney-mk", optionId: "disney-4d", date: future(60), pax: { adults: 2, children: 2 } } },
  { supplier: "MASTER_VACATION_HOME", req: { productId: "windsor-hills-5", checkIn: future(58), checkOut: future(66), pax: { adults: 2, children: 2 } } },
], at("2026-10-08", "09:00"), 4);
await sell({ cart: c2, customer: joao, method: "CARD", paidAt: at("2026-10-12", "11:20") });

// Pedido 3 — 2ª quinzena de outubro: hotel Orlando + seguro, com cupons
const c3 = await buildCart(ana.id, { type: "CUSTOMER", id: maria.id }, [
  { supplier: "GGT_BEST_BUY", req: { productId: "ggt_best_buy-orl-lakeside", optionId: "fam-bb", checkIn: future(70), checkOut: future(84), pax: { adults: 2, children: 2, rooms: 1 } } },
  { supplier: "INTERMAC", req: { productId: "im-150", optionId: "América do Norte", startDate: future(70), endDate: future(84), pax: { adults: 4, children: 0, seniors: 0 } } },
  { supplier: "NADIO", req: { productId: "universal", optionId: "universal-p2p", date: future(75), pax: { adults: 2, children: 2 } } },
], at("2026-10-17", "19:30"), 11);
await applyCouponToCart(db, c3, "BEMVINDO5");
await applyCouponToCart(db, c3, "ANA100");
await sell({ cart: c3, customer: maria, method: "PIX", paidAt: at("2026-10-21", "08:05") });

// Pedido 4 — Rota Brasil, 1ª quinzena
const c4 = await buildCart(rota.id, { type: "CUSTOMER", id: lucia.id }, [
  { supplier: "RATEHAWK", req: { productId: "ratehawk-lis-chiado", optionId: "dbl-bb", checkIn: future(35), checkOut: future(40), pax: { adults: 2, children: 0, rooms: 1 } } },
], at("2026-10-06", "13:00"), 3);
await sell({ cart: c4, customer: lucia, method: "CARD", paidAt: at("2026-10-07", "15:00") });

// Fecha as quinzenas de outubro (como o agendador faria nos dias 16 e 1º)
const oct1 = await closeFortnight(db, fortnightOf("2026-10-01"), { type: "CRON" });
await closeFortnight(db, fortnightOf("2026-10-16"), { type: "CRON" });
for (const p of oct1.payouts) {
  await markPayoutPaid(db, p.id, owner.id, "Transferência via Pix");
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 20 100 Td (Comprovante de repasse Subrinho) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  );
  await attachPayoutProof(db, p.id, { filename: `comprovante-${p.periodStart}.pdf`, mimeType: "application/pdf", data: pdf }, owner.id);
}

// Pedido 5 — quinzena atual (aberta): eSIM + ingresso, PIX
const c5 = await buildCart(ana.id, { type: "CUSTOMER", id: joao.id }, [
  { supplier: "ESIMX", req: { productId: "eu-10", pax: { adults: 0, children: 0, units: 2 } } },
  { supplier: "TU_EXPERIENZA", req: { productId: "colosseo", optionId: "colosseo-1d", date: future(20), pax: { adults: 2, children: 0 } } },
], new Date(Date.now() - 2 * 86400_000), 2);
await sell({ cart: c5, customer: joao, method: "PIX", paidAt: new Date(Date.now() - 86400_000) });

// Pedido pendente (Pix gerado, aguardando pagamento)
const c6 = await buildCart(ana.id, { type: "CUSTOMER", id: maria.id }, [
  { supplier: "TU_EXPERIENZA", req: { productId: "vaticano", optionId: "vaticano-guiado", date: future(25), pax: { adults: 2, children: 0 } } },
], new Date(Date.now() - 3600_000), 1);
await placeOrder(db, { cart: c6, customer: maria, payer: { name: maria.name, document: maria.document, email: maria.email }, travelers: [], paymentMethod: "PIX", installments: 1, revalidate: false });

// Carrinho aberto compartilhado pela agência, com 1 item que já expirou (data passou)
const c7 = await buildCart(ana.id, { type: "AFFILIATE", id: anaAdmin.id }, [
  { supplier: "MAPRO", req: { productId: "storey-lake-4", checkIn: future(90), checkOut: future(97), pax: { adults: 4, children: 2 } } },
  { supplier: "NADIO", req: { productId: "disney-mk", optionId: "disney-1d", date: future(91), pax: { adults: 4, children: 2 } } },
], new Date(Date.now() - 5 * 86400_000), 9);
const expired = await getAdapter("NADIO").quote({ productId: "empire-state", optionId: "esb-86", date: future(10), pax: { adults: 2, children: 0 } });
const [exp] = await db.insert(cartItems).values({
  cartId: c7.id, category: "TICKETS", supplierCode: "NADIO", productId: expired.productId, optionId: expired.optionId,
  title: expired.title, subtitle: expired.subtitle, location: expired.location, serviceDate: addDays(today, -1),
  expiresAt: new Date(Date.now() - 86400_000), pax: expired.pax, lines: expired.lines, costCurrency: expired.currency,
  details: { paxRules: expired.paxRules }, supplierQuoteRef: expired.quoteRef,
}).returning();
void exp;

console.log("✔ Seed concluído");
console.log("  Painel Subrinho: /subrinho/login  admin@subrinho.com.br / subrinho123");
console.log("  Painel Afiliado: /afiliado/login  ana@viagensdaana.com.br / afiliado123");
console.log("  Loja:            /loja/viagens-da-ana  maria@cliente.com.br / cliente123");
console.log("  Outras lojas (white-label): /loja/rota-brasil  /loja/sol-e-mar (marina@solemar.com.br / afiliado123)");
console.log(`  Carrinho compartilhado de exemplo: /loja/viagens-da-ana/carrinho/${c7.token}`);
await closeDb();
