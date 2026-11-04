/**
 * Chip eSIM pela API de atacado da eSIMX (ver client.ts e catalog.ts).
 *
 * Venda:
 *  - busca por país, região ou cidade (resolvida para o país); a própria eSIMX devolve, para um
 *    país, também os pacotes regionais que o cobrem;
 *  - um pacote por combinação de franquia × dias (o mais barato entre as "séries" do fornecedor);
 *  - preço de atacado em USD (centavos na API) → motor de preço da loja (câmbio + margens).
 *
 * Emissão (só depois do pagamento, pelo fluxo de emissão controlada):
 *  - `customer_order_id` = a nossa referência do item (SUB<pedido>-<posição>): a eSIMX não cobra de
 *    novo quando a mesma referência chega outra vez, então repetir é seguro (resposta perdida, 503);
 *  - preço conferido na hora (nunca compra acima do custo vendido) e pago com o saldo da conta;
 *  - o eSIM fica pronto em segundos: espera um pouco; se ainda não ficou, volta "PENDING" e a página
 *    do pedido (ou o painel) consulta de novo.
 *
 * O cliente recebe o código de ativação (LPA): o QR Code é gerado por nós (o link de imagem do
 * fornecedor não vai para o cliente).
 */
import { Decimal } from "decimal.js";
import { photo } from "@/lib/images";
import { cached, cachedStale } from "../hotels/cache";
import { SupplierError, SupplierIntegrationError, type BookContext, type BookItem, type BookingResult, type CancelResult, type OfferOption, type PaxRule, type ProductDetail, type ProductSummary, type Quote, type QuoteRequest, type SearchParams, type SupplierAdapter } from "../types";
import { EsimxApiError, EsimxClient, ESIMX_CODE, esimxConfig, isEsimxCode, type EsimxConfig, type Transport } from "./client";
import {
  coverageLabel,
  coverageNames,
  curatePlans,
  dataLabel,
  daysLabel,
  planArea,
  planNetwork,
  POPULAR_AREAS,
  REGION_NAME,
  resolveArea,
  sellablePlan,
  slimPackage,
  throttleNote,
  countryName,
  type EsimxArea,
  type EsimxPackage,
  type Plan,
  type ResolvedArea,
} from "./catalog";

export const ESIMX_SUPPLIER = "ESIMX";
const NAME = "eSIMX";
const MAX_UNITS = 20;

const CHIP_PAX: PaxRule[] = [{ type: "UNIT", label: "Quantidade de eSIMs", min: 1, max: MAX_UNITS, hint: "Um eSIM para cada celular" }];

type Paged<T> = { page_num?: number; page_size?: number; total_page?: number; total?: number; list?: T[] };

export type EsimxOrder = {
  order_id: string;
  customer_order_id?: string;
  type?: string;
  status?: string;
  amount?: number;
  currency?: string;
  packages?: { package_code?: string; package_name?: string; qty?: number; unit_amount?: number; total_amount?: number }[];
  esim_ids?: string[];
  create_at?: string;
  modify_at?: string;
  replayed?: boolean;
  balance_after?: number;
};

export type EsimxEsim = {
  esim_id: string;
  order_id?: string;
  iccid?: string;
  smdp_address?: string;
  activation_code?: string;
  lpa?: string;
  qrcode?: string;
  apple_link?: string;
  pin?: string;
  puk?: string;
  apn?: string;
  status?: string;
  topup?: boolean;
  total_data?: number;
  total_data_usage?: number;
  is_daily?: boolean;
  latest_daily_usage?: number;
  activate_at?: string;
  expire_at?: string;
};

/** Dados do eSIM que podem ir para o cliente (sem links do fornecedor). */
export type DeliveredEsim = {
  esimId: string;
  iccid: string | null;
  lpa: string | null;
  smdp: string | null;
  activationCode: string | null;
  apn: string | null;
  /** Instalação com um toque (iOS 17.4+): sempre no domínio da Apple. */
  appleLink: string | null;
  status: string | null;
  totalMb: number | null;
  usedMb: number | null;
  daily: boolean;
  activateAt: string | null;
  expireAt: string | null;
};

export function deliveredEsim(e: EsimxEsim): DeliveredEsim {
  const smdp = e.smdp_address?.trim() || null;
  const code = e.activation_code?.trim() || null;
  return {
    esimId: e.esim_id,
    iccid: e.iccid ?? null,
    lpa: e.lpa?.trim() || (smdp && code ? `LPA:1$${smdp}$${code}` : null),
    smdp,
    activationCode: code,
    apn: e.apn?.trim() || null,
    appleLink: appleInstallLink(e),
    status: e.status ?? null,
    totalMb: typeof e.total_data === "number" ? e.total_data : null,
    usedMb: typeof e.total_data_usage === "number" ? e.total_data_usage : null,
    daily: !!e.is_daily,
    activateAt: e.activate_at ?? null,
    expireAt: e.expire_at ?? null,
  };
}

/** Link de instalação da Apple: o do fornecedor só se for da Apple; senão montado a partir do LPA. */
export function appleInstallLink(e: Pick<EsimxEsim, "apple_link" | "lpa" | "smdp_address" | "activation_code">): string | null {
  try {
    if (e.apple_link && new URL(e.apple_link).hostname === "esimsetup.apple.com") return e.apple_link;
  } catch {
    /* link inválido: monta o nosso */
  }
  const smdp = e.smdp_address?.trim();
  const code = e.activation_code?.trim();
  const lpa = e.lpa?.trim() || (smdp && code ? ["LPA:1", smdp, code].join("$") : null);
  return lpa ? `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}` : null;
}

/** Status do pedido na eSIMX → status da reserva no Subrinho. */
export function orderStatus(o: Pick<EsimxOrder, "status">, esims: number, units: number): string {
  switch (o.status) {
    case "COMPLETED":
      return esims >= Math.max(1, units) ? "CONFIRMED" : "PENDING";
    case "REFUNDED":
      return "CANCELLED";
    case "CLOSED":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

/** `customer_order_id`: 1 a 64 caracteres; mantemos só letras, números, hífen e sublinhado. */
export const customerOrderId = (ref: string | undefined | null) => (ref ?? "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);

const usd = (cents: number) => new Decimal(cents).div(100);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type EsimxAdapter = SupplierAdapter & {
  client: EsimxClient;
  /** Saldo da conta (centavos de USD). */
  balance(): Promise<number>;
  /** eSIMs do pedido, atualizados (status e uso de dados), para o voucher. */
  liveEsims(orderId: string): Promise<DeliveredEsim[]>;
};

export function createEsimxAdapter(cfg: EsimxConfig, opts: { transport?: Transport; waitMs?: number; pollMs?: number } = {}): EsimxAdapter {
  const client = new EsimxClient(cfg, opts.transport);
  const waitMs = opts.waitMs ?? 20_000;
  const pollMs = opts.pollMs ?? 2_500;

  // ─────────────── catálogo (cache compartilhado entre instâncias) ───────────────

  const areas = () => cached(`esimx:areas`, 24 * 3600, () => client.get<EsimxArea[]>("/area/list", {}, 30_000), { cacheIf: (v) => Array.isArray(v) && v.length > 0 });

  async function pages(query: Record<string, string>): Promise<Plan[]> {
    const out: Plan[] = [];
    for (let page = 1; page <= 30; page++) {
      const d = await client.get<Paged<EsimxPackage>>("/package/list", { ...query, page_num: page, page_size: 100 }, 45_000);
      out.push(...(d?.list ?? []).map(slimPackage));
      if (page >= (d?.total_page ?? 1)) break;
    }
    return out;
  }

  /** Pacotes de um país/região (cache: 30 min fresco, até 12 h servindo o anterior). */
  const plansFor = (areaCode: string) => cachedStale(`esimx:plans:${areaCode}`, 30 * 60, 12 * 3600, () => pages({ area_code: areaCode }));

  /** Catálogo inteiro (para a lista de destinos com cobertura). */
  const allPlans = () => cachedStale(`esimx:plans:*`, 3600, 24 * 3600, () => pages({}));

  async function planByCode(code: string, fresh = false): Promise<Plan | null> {
    if (!/^[A-Za-z0-9._~-]{1,120}$/.test(code)) return null;
    const load = async () => {
      try {
        return slimPackage(await client.get<EsimxPackage>(`/package/${encodeURIComponent(code)}`, {}, 30_000));
      } catch (e) {
        if (isEsimxCode(e, ESIMX_CODE.NOT_FOUND)) return null;
        throw e;
      }
    };
    return fresh ? load() : cached(`esimx:plan:${code}`, 5 * 60, load, { cacheIf: (v) => v !== null });
  }

  async function resolve(text: string | undefined): Promise<ResolvedArea | null> {
    if (!text?.trim()) return null;
    // sem a lista de áreas (API fora do ar/bloqueada) a falha sobe: a loja diz "indisponível", não "não temos"
    return resolveArea(text, await areas());
  }

  /** Regiões que de fato têm pacote (a lista de áreas traz regiões vazias). */
  const regionsWithPlans = () =>
    cached(`esimx:regions`, 24 * 3600, async () => {
      const regions = (await areas()).filter((a) => a.type === "REGION");
      const totals = await Promise.all(regions.map((r) => client.get<Paged<EsimxPackage>>("/package/list", { area_code: r.code, page_size: 1 }, 30_000).then((d) => (d?.total ?? 0) > 0, () => false)));
      return regions.filter((_, i) => totals[i]).map((r) => r.code);
    });

  // destinos com cobertura (para as sugestões do campo "Destino"); a lista enche no primeiro uso
  let known: { id: string; name: string }[] | null = null;
  let warming: Promise<void> | null = null;
  function warm() {
    if (known || warming) return;
    warming = Promise.all([areas(), allPlans(), regionsWithPlans()])
      .then(([as, ps, regions]) => {
        const covered = new Set(ps.filter(sellablePlan).flatMap((p) => p.countries.map((c) => c.code)));
        const countries = as.filter((a) => a.type === "COUNTRY" && covered.has(a.code)).map((a) => countryName(a.code));
        known = [...regions.map((r) => REGION_NAME[r] ?? r), ...countries.sort((a, b) => a.localeCompare(b, "pt-BR"))].map((n) => ({ id: n, name: n }));
      })
      .catch(() => undefined)
      .finally(() => {
        warming = null;
      });
  }

  const lines = (p: Plan, units: number) => [{ type: "UNIT", label: `eSIM ${dataLabel(p)} · ${daysLabel(p.days)}`, unitCost: usd(p.cents).toFixed(2), quantity: units }];

  function summaryOf(p: Plan, area: ResolvedArea | null): ProductSummary {
    const focus = area?.type === "COUNTRY" && p.countries.some((c) => c.code === area.code) ? area.code : null;
    const where = area?.name ?? planArea(p);
    const ops = focus ? (p.countries.find((c) => c.code === focus)?.operators ?? []) : [...new Set(p.countries.flatMap((c) => c.operators))].slice(0, 4);
    const network = planNetwork(p, focus);
    return {
      supplierCode: ESIMX_SUPPLIER,
      supplierName: NAME,
      category: "CHIP",
      productId: p.code,
      title: `eSIM ${where} · ${dataLabel(p)}`,
      subtitle: `${daysLabel(p.days)} · ${coverageLabel(p, focus)}`,
      location: coverageLabel(p, focus),
      destination: where,
      imageUrl: photo("phone", 900),
      tags: [network, ...(p.tethering ? ["Hotspot"] : []), ...(p.topup ? ["Recarregável"] : []), ...(p.daily ? ["Diário"] : []), ...(p.calls ? ["Ligações"] : [])],
      currency: "USD",
      lines: lines(p, 1),
      chip: {
        dataMb: p.dataMb,
        days: p.days,
        daily: p.daily,
        network,
        tethering: p.tethering,
        topup: p.topup,
        calls: p.calls,
        coverage: coverageLabel(p, focus),
        countries: coverageNames(p),
        operators: ops,
        throttle: throttleNote(p),
      },
    };
  }

  // ─────────────── pedidos e eSIMs ───────────────

  async function esimsOf(orderId: string): Promise<EsimxEsim[]> {
    const d = await client.get<Paged<EsimxEsim>>("/esim/list", { order_id: orderId, page_size: 100 }, 30_000);
    return d?.list ?? [];
  }

  async function resultOf(o: EsimxOrder, units?: number): Promise<BookingResult> {
    const qty = units ?? (o.packages ?? []).reduce((s, p) => s + (p.qty ?? 0), 0);
    const esims = o.status === "COMPLETED" ? await esimsOf(o.order_id) : [];
    return {
      bookingRef: o.order_id,
      status: orderStatus(o, esims.length, qty || 1),
      payload: {
        orderId: o.order_id,
        customerOrderId: o.customer_order_id ?? null,
        orderStatus: o.status ?? null,
        amountCents: o.amount ?? null,
        units: qty || null,
        packages: (o.packages ?? []).map((p) => ({ code: p.package_code, qty: p.qty, unitCents: p.unit_amount })),
        esims: esims.map(deliveredEsim),
      },
    };
  }

  /** Espera o pedido ficar pronto (eSIMs emitidos), sem passar de `waitMs`. */
  async function settle(orderId: string, units: number, first?: EsimxOrder): Promise<BookingResult> {
    const until = Date.now() + waitMs;
    let o = first ?? (await client.get<EsimxOrder>(`/order/${encodeURIComponent(orderId)}`));
    for (;;) {
      const r = await resultOf(o, units);
      if (r.status !== "PENDING" || Date.now() + pollMs > until) return r;
      await sleep(pollMs);
      o = await client.get<EsimxOrder>(`/order/${encodeURIComponent(orderId)}`);
    }
  }

  async function findByReference(reference: string): Promise<EsimxOrder | null> {
    const d = await client.get<Paged<EsimxOrder>>("/order/list", { customer_order_id: reference, page_size: 5 }, 30_000);
    return (d?.list ?? []).find((o) => (o.customer_order_id ?? "").toLowerCase() === reference.toLowerCase()) ?? null;
  }

  async function balanceText(): Promise<string> {
    const b = await client.get<{ balance?: number }>("/organization/balance").catch(() => null);
    return typeof b?.balance === "number" ? ` (saldo atual US$ ${usd(b.balance).toFixed(2)})` : "";
  }

  const adapter: EsimxAdapter = {
    code: ESIMX_SUPPLIER,
    name: NAME,
    category: "CHIP",
    defaultCurrency: "USD",
    live: true,
    client,
    cancelSimulation: false,

    destinations() {
      warm();
      return known ?? POPULAR_AREAS.map((a) => ({ id: a.name, name: a.name }));
    },

    async search(params: SearchParams): Promise<ProductSummary[]> {
      warm();
      const area = await resolve(params.destination);
      if (!area) return [];
      const plans = curatePlans(await plansFor(area.code), area.type === "COUNTRY" ? area.code : null);
      return plans.map((p) => summaryOf(p, area));
    },

    async getProduct(productId: string, params: SearchParams): Promise<ProductDetail | null> {
      const p = await planByCode(productId);
      if (!p || !sellablePlan(p)) return null;
      const area = await resolve(params.destination);
      const s = summaryOf(p, area);
      const c = s.chip!;
      const option: OfferOption = {
        optionId: p.code,
        title: `${dataLabel(p)} · ${daysLabel(p.days)}`,
        description: c.coverage,
        currency: "USD",
        lines: lines(p, 1),
        available: true,
        attributes: [
          { label: "Rede", value: c.network },
          { label: "Hotspot", value: p.tethering ? "Sim" : "Não" },
        ],
      };
      return {
        ...s,
        description: [
          `Internet móvel de ${dataLabel(p)} por ${daysLabel(p.days)} (${c.coverage}). O QR Code chega logo depois do pagamento: instale o eSIM antes de viajar e ative ao chegar. A validade começa quando o celular se conecta à rede no destino.`,
          c.throttle ? `${c.throttle}.` : "",
          p.calls ? "Inclui número para ligações." : "Somente dados: use WhatsApp e apps de chamada normalmente.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        highlights: ["QR Code logo depois do pagamento", "Ativação automática no destino", ...(p.tethering ? ["Pode compartilhar a internet (hotspot)"] : []), ...(p.topup ? ["Dá para recarregar mais dados"] : [])],
        options: [option],
        paxRules: CHIP_PAX,
        info: [
          { label: "Franquia", value: dataLabel(p) },
          { label: "Validade", value: `${daysLabel(p.days)} a partir da primeira conexão no destino` },
          { label: "Rede", value: c.network },
          ...(c.operators.length ? [{ label: "Operadoras", value: c.operators.join(", ") }] : []),
          { label: "Países", value: c.countries.join(", ") },
        ],
      };
    },

    async quote(req: QuoteRequest): Promise<Quote> {
      const p = await planByCode(req.productId);
      if (!p || !sellablePlan(p)) throw new SupplierError("Este plano de eSIM não está mais disponível, escolha outro");
      const units = Math.min(MAX_UNITS, Math.max(1, Math.floor(req.pax.units ?? 1)));
      return {
        supplierCode: ESIMX_SUPPLIER,
        category: "CHIP",
        productId: p.code,
        optionId: p.code,
        title: `eSIM ${planArea(p)} · ${dataLabel(p)}`,
        subtitle: `${daysLabel(p.days)} · ${coverageLabel(p)}${units > 1 ? ` · ${units} eSIMs` : ""}`,
        location: coverageLabel(p),
        imageUrl: photo("phone", 900),
        serviceDate: req.startDate ?? null,
        serviceEndDate: null,
        // o eSIM não vence no carrinho: a validade só começa no destino
        expiresAt: null,
        currency: "USD",
        lines: lines(p, units),
        pax: { adults: 0, children: 0, units },
        paxRules: CHIP_PAX,
        details: { packageCode: p.code, unitCents: p.cents, dataMb: p.dataMb, days: p.days, daily: p.daily, countries: p.countries.length },
        quoteRef: `ESX:${p.code}:${units}:${p.cents}`,
      };
    },

    async findBooking(item: BookItem): Promise<BookingResult | null> {
      const reference = customerOrderId(item.reference);
      if (!reference) return null;
      const o = await findByReference(reference);
      return o ? settle(o.order_id, Math.max(1, item.pax.units ?? 1), o) : null;
    },

    async book(item: BookItem, _ctx: BookContext): Promise<BookingResult> {
      const reference = customerOrderId(item.reference);
      if (!reference) throw new SupplierError("Reserva sem referência interna");
      const units = Math.min(MAX_UNITS, Math.max(1, Math.floor(item.pax.units ?? 1)));
      // mesma referência já comprada (resposta anterior perdida): recupera em vez de comprar de novo
      const existing = await findByReference(reference);
      if (existing) return settle(existing.order_id, units, existing);

      // preço na hora: nunca compra acima do custo vendido
      const p = await planByCode(item.productId, true);
      if (!p || !sellablePlan(p)) throw new SupplierError("Este plano de eSIM saiu do catálogo do fornecedor. Escolha outro plano para o cliente.");
      const cost = usd(p.cents).times(units);
      if (item.maxCost) {
        if (item.maxCost.currency !== "USD") throw new SupplierError(`Moeda do custo vendido (${item.maxCost.currency}) diferente da do fornecedor (USD), não compramos`);
        if (cost.gt(new Decimal(item.maxCost.amount).plus("0.01"))) throw new SupplierError(`O fornecedor aumentou o preço (US$ ${cost.toFixed(2)} > vendido US$ ${new Decimal(item.maxCost.amount).toFixed(2)}). O eSIM não foi comprado.`);
      }

      const body = { customer_order_id: reference, cart_list: [{ package_code: p.code, qty: units }] };
      let order: EsimxOrder;
      try {
        try {
          order = await client.post<EsimxOrder>("/order/purchase", body, 60_000);
        } catch (e) {
          // a documentação garante: repetir com o mesmo customer_order_id não cobra de novo
          const transient = (e instanceof SupplierIntegrationError && !(e instanceof EsimxApiError) && !!e.detail?.timeout) || isEsimxCode(e, ESIMX_CODE.BUSY);
          if (!transient) throw e;
          await sleep(1_500);
          order = await client.post<EsimxOrder>("/order/purchase", body, 60_000);
        }
      } catch (e) {
        if (isEsimxCode(e, ESIMX_CODE.NO_BALANCE)) throw new SupplierError(`Saldo insuficiente na conta da eSIMX para este eSIM (US$ ${cost.toFixed(2)})${await balanceText()}. Recarregue o saldo no console da eSIMX e clique em emitir de novo.`);
        if (isEsimxCode(e, ESIMX_CODE.PACKAGE_UNAVAILABLE)) throw new SupplierError("Este plano de eSIM ficou indisponível no fornecedor. Escolha outro plano para o cliente.");
        if (isEsimxCode(e, ESIMX_CODE.ORG_DISABLED)) throw new SupplierError("A conta da eSIMX está desativada. Fale com a eSIMX.");
        if (isEsimxCode(e, ESIMX_CODE.ORDER_ID_CONFLICT)) {
          const id = (e.data as { order_id?: string } | null)?.order_id;
          throw new SupplierIntegrationError(`A referência ${reference} já foi usada em outro pedido na eSIMX${id ? ` (${id})` : ""}. Confira no console antes de emitir de novo.`, { reference, orderId: id ?? null });
        }
        if (e instanceof EsimxApiError && e.code === ESIMX_CODE.BAD_PARAM) throw new SupplierError(`A eSIMX recusou o pedido: ${e.message.replace(/^eSIMX [^:]*: /, "")}`);
        // sem resposta: o pedido pode ter sido criado; procura pela referência antes de desistir
        const found = await findByReference(reference).catch(() => null);
        if (found) return settle(found.order_id, units, found);
        throw e;
      }
      if (!order?.order_id) throw new SupplierIntegrationError("eSIMX: pedido sem order_id na resposta", { order });
      const r = await settle(order.order_id, units, order);
      r.payload.quotedCost = cost.toFixed(2);
      r.payload.unitCents = p.cents;
      if (typeof order.balance_after === "number") r.payload.balanceAfterCents = order.balance_after;
      if (order.replayed) r.payload.replayed = true;
      return r;
    },

    async bookingStatus(bookingRef: string, stored?: Record<string, unknown>): Promise<BookingResult> {
      try {
        const o = await client.get<EsimxOrder>(`/order/${encodeURIComponent(bookingRef)}`);
        return resultOf(o, typeof stored?.units === "number" ? stored.units : undefined);
      } catch (e) {
        if (isEsimxCode(e, ESIMX_CODE.NOT_FOUND)) throw new SupplierError("Pedido não encontrado na eSIMX");
        throw e;
      }
    },

    async cancelBooking(bookingRef: string, o: { simulate: boolean }): Promise<CancelResult> {
      if (o.simulate) throw new SupplierError("A eSIMX não simula: o cancelamento devolve ao saldo a parte não usada e só vale para eSIM ainda não ativado.");
      const esims = await esimsOf(bookingRef);
      if (!esims.length) throw new SupplierError("O pedido ainda não tem eSIM emitido. Atualize o status e tente de novo.");
      const refunds: { esimId: string; refundCents: number }[] = [];
      const blocked: string[] = [];
      for (const e of esims) {
        if (e.status === "CANCELED") continue;
        try {
          const r = await client.post<{ refund_amount?: number }>(`/esim/${encodeURIComponent(e.esim_id)}/cancel`, {});
          refunds.push({ esimId: e.esim_id, refundCents: r?.refund_amount ?? 0 });
        } catch (err) {
          if (isEsimxCode(err, ESIMX_CODE.CANNOT_CANCEL, ESIMX_CODE.STATUS_NOT_ALLOWED, ESIMX_CODE.REJECTED, ESIMX_CODE.NOT_SUPPORTED)) blocked.push(`${e.iccid ?? e.esim_id} (${e.status ?? "?"})`);
          else throw err;
        }
      }
      const refundCents = refunds.reduce((s, r) => s + r.refundCents, 0);
      if (blocked.length) {
        throw new SupplierError(
          `${refunds.length ? `${refunds.length} eSIM(s) cancelado(s), com US$ ${usd(refundCents).toFixed(2)} de volta ao saldo. ` : ""}Não deu para cancelar: ${blocked.join(", ")}. O eSIM só pode ser cancelado antes de ser ativado.`,
        );
      }
      return { status: "CANCELLED", penalty: null, reference: bookingRef, payload: { cancelledAt: new Date().toISOString(), refunds, refundCents } };
    },

    async voucher(bookingRef: string) {
      return { esims: await adapter.liveEsims(bookingRef) };
    },

    async balance() {
      const b = await client.get<{ balance?: number }>("/organization/balance");
      return Number(b?.balance ?? 0);
    },

    async liveEsims(orderId: string) {
      return (await esimsOf(orderId)).map(deliveredEsim);
    },
  };

  return adapter;
}

export function createEsimxFromEnv(env: NodeJS.ProcessEnv = process.env): EsimxAdapter | null {
  const cfg = esimxConfig(env);
  return cfg ? createEsimxAdapter(cfg) : null;
}
