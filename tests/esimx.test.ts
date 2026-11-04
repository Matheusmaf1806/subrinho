/**
 * eSIMX (chip eSIM): catálogo em português, cliente da API e emissão segura.
 * Tudo com respostas simuladas (transport falso): nenhuma chamada real, nada é comprado.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { clearMemoryCache } from "@/server/suppliers/hotels/cache";
import { createEsimxAdapter, appleInstallLink, customerOrderId, orderStatus } from "@/server/suppliers/esimx/adapter";
import { EsimxApiError, EsimxClient, type Transport } from "@/server/suppliers/esimx/client";
import { coverageLabel, curatePlans, dataLabel, planArea, resolveArea, sellablePlan, slimPackage, throttleNote, type EsimxPackage } from "@/server/suppliers/esimx/catalog";
import { SupplierError } from "@/server/suppliers/types";

const AREAS = [
  { code: "IT", name: "Italy", type: "COUNTRY" },
  { code: "FR", name: "France", type: "COUNTRY" },
  { code: "US", name: "United States", type: "COUNTRY" },
  { code: "JP", name: "Japan", type: "COUNTRY" },
  { code: "europe", name: "Europe", type: "REGION" },
];

const pkg = (over: Partial<EsimxPackage> & { code: string }): EsimxPackage => ({
  name: "Italy 10GB 30Days",
  data: 10240,
  validity: 30,
  amount: 893,
  currency: "USD",
  is_daily: false,
  topup: true,
  tethering: true,
  ekyc: false,
  billing_type: "ONLINE",
  sim_type: "DATA_ONLY",
  throttle_speed: "128kbps",
  coverages: [{ code: "IT", network: "5G", operators: [{ operator: "TIM", networks: ["5G"] }] }],
  ...over,
});

const EU = (code: string, data: number, days: number, cents: number, net = "4G") =>
  pkg({ code, name: `Europe Series B ${data / 1024}GB ${days}Days`, data, validity: days, amount: cents, coverages: ["IT", "FR", "ES", "DE"].map((c) => ({ code: c, network: net, operators: [{ operator: `Op ${c}` }] })) });

describe("catálogo", () => {
  it("vende só o que a loja consegue entregar", () => {
    expect(sellablePlan(slimPackage(pkg({ code: "ok" })))).toBe(true);
    expect(sellablePlan(slimPackage(pkg({ code: "kyc", ekyc: true })))).toBe(false);
    expect(sellablePlan(slimPackage(pkg({ code: "ord", billing_type: "ORDER" })))).toBe(false);
    expect(sellablePlan(slimPackage(pkg({ code: "tel", sim_type: "PHONE" })))).toBe(false);
    expect(sellablePlan(slimPackage(pkg({ code: "zero", amount: 0 })))).toBe(false);
  });

  it("um plano por franquia × dias: o mais barato; empate → melhor rede no país buscado", () => {
    const plans = [pkg({ code: "it-10-30", amount: 893 }), EU("eu-10-30", 10240, 30, 700), EU("eu5g-10-30", 10240, 30, 700, "5G"), EU("eu-5-7", 5120, 7, 289), pkg({ code: "it-d1-7", data: 1024, validity: 7, is_daily: true, amount: 500 })].map(slimPackage);
    const out = curatePlans(plans, "IT");
    expect(out.map((p) => p.code)).toEqual(["eu-5-7", "eu5g-10-30", "it-d1-7"]);
  });

  it("entende país, região e cidade em português", () => {
    expect(resolveArea("Itália", AREAS)).toEqual({ code: "IT", name: "Itália", type: "COUNTRY" });
    expect(resolveArea("Paris, França", AREAS)?.code).toBe("FR");
    expect(resolveArea("Orlando", AREAS)?.code).toBe("US");
    expect(resolveArea("eua", AREAS)?.name).toBe("Estados Unidos");
    expect(resolveArea("europa", AREAS)).toEqual({ code: "europe", name: "Europa", type: "REGION" });
    expect(resolveArea("japan", AREAS)?.code).toBe("JP");
    expect(resolveArea("ital", AREAS)?.code).toBe("IT");
    expect(resolveArea("Atlântida", AREAS)).toBeNull();
    expect(resolveArea("", AREAS)).toBeNull();
  });

  it("textos do card sem o nome interno do pacote", () => {
    const eu = slimPackage(EU("eu", 10240, 7, 548));
    expect(dataLabel(eu)).toBe("10 GB");
    expect(dataLabel({ dataMb: 2048, daily: true })).toBe("2 GB por dia");
    expect(dataLabel({ dataMb: 512, daily: false })).toBe("512 MB");
    expect(coverageLabel(eu, "IT")).toBe("Itália + 3 países");
    expect(coverageLabel(eu)).toBe("4 países");
    expect(planArea(eu)).toBe("Europa");
    expect(planArea(slimPackage(pkg({ code: "it" })))).toBe("Itália");
    expect(throttleNote(eu)).toBe("Depois da franquia: 128 kbps");
  });
});

describe("cliente", () => {
  const client = (body: string, status = 200, seen?: { headers?: Record<string, string> }) =>
    new EsimxClient({ apiKey: "k-123", baseUrl: "https://x.test/api/api/v1" }, async (req) => {
      if (seen) seen.headers = req.headers;
      return { status, body };
    });

  it("manda a chave no x-api-key e se identifica", async () => {
    const seen: { headers?: Record<string, string> } = {};
    await client(JSON.stringify({ code: 200, data: { balance: 1 } }), 200, seen).get("/organization/balance");
    expect(seen.headers?.["x-api-key"]).toBe("k-123");
    expect(seen.headers?.["User-Agent"]).toMatch(/^Subrinho\//);
  });

  it("erro de negócio com HTTP 200 vira erro com o código", async () => {
    await expect(client(JSON.stringify({ code: 50001, message: "Balance not enough" })).post("/order/purchase", {})).rejects.toMatchObject({ code: 50001 });
  });

  it("401, página do Cloudflare e corpo vazio viram erro de integração", async () => {
    await expect(client("", 401).get("/area/list")).rejects.toBeInstanceOf(EsimxApiError);
    await expect(client("<!DOCTYPE html><title>Just a moment...</title>", 403).get("/area/list")).rejects.toMatchObject({ status: 403 });
  });
});

// ───────────────────────── adaptador com API simulada ─────────────────────────

type Call = { method: string; path: string; body?: unknown };

function fakeApi(handlers: (c: Call) => { code?: number; data?: unknown; status?: number } | undefined) {
  const calls: Call[] = [];
  const transport: Transport = async (req) => {
    const u = new URL(req.url);
    const c: Call = { method: req.method, path: `${u.pathname.replace("/api/api/v1", "")}${u.search}`, body: req.body ? JSON.parse(req.body) : undefined };
    calls.push(c);
    const r = handlers(c) ?? { code: 404, data: null };
    return { status: r.status ?? 200, body: JSON.stringify({ code: r.code ?? 200, message: "x", data: r.data }) };
  };
  return { calls, transport };
}

const PKG = EU("esim-eubt10-7", 10240, 7, 548, "5G");
const ESIM = { esim_id: "E1", iccid: "8985200000000000001", smdp_address: "smdp.example", activation_code: "ABC123", qrcode: "https://cdn.supplier.example/qr.png", apple_link: "https://supplier.example/install", status: "QUEUED", total_data: 10240, total_data_usage: 0 };

describe("adaptador", () => {
  beforeEach(() => clearMemoryCache());
  const cfg = { apiKey: "k", baseUrl: "https://x.test/api/api/v1" };

  it("busca: planos curados do destino, com dados do card", async () => {
    const api = fakeApi((c) => {
      if (c.path === "/area/list") return { data: AREAS };
      if (c.path.startsWith("/package/list?area_code=IT")) return { data: { total_page: 1, list: [PKG, pkg({ code: "it-1-7", data: 1024, validity: 7, amount: 109 })] } };
      if (c.path.startsWith("/package/list")) return { data: { total_page: 1, total: 0, list: [] } };
    });
    const a = createEsimxAdapter(cfg, { transport: api.transport });
    const r = await a.search({ destination: "Itália" });
    expect(r.map((p) => p.title)).toEqual(["eSIM Itália · 1 GB", "eSIM Itália · 10 GB"]);
    expect(r[1].chip).toMatchObject({ dataMb: 10240, days: 7, network: "5G", coverage: "Itália + 3 países" });
    expect(r[1].lines[0]).toMatchObject({ unitCost: "5.48", quantity: 1 });
    // o que o cliente vê não cita o fornecedor nem o nome interno do pacote
    const visible = r.map(({ title, subtitle, location, destination, tags, chip, lines }) => ({ title, subtitle, location, destination, tags, chip, labels: lines.map((l) => l.label) }));
    expect(JSON.stringify(visible)).not.toMatch(/esimx|Series/i);
  });

  it("cotação: preço atual × quantidade de chips", async () => {
    const api = fakeApi((c) => (c.path === `/package/${PKG.code}` ? { data: PKG } : undefined));
    const q = await createEsimxAdapter(cfg, { transport: api.transport }).quote({ productId: PKG.code, pax: { adults: 0, children: 0, units: 3 } });
    expect(q.lines).toEqual([{ type: "UNIT", label: "eSIM 10 GB · 7 dias", unitCost: "5.48", quantity: 3 }]);
    expect(q.title).toBe("eSIM Europa · 10 GB");
    expect(q.currency).toBe("USD");
    expect(q.expiresAt).toBeNull();
  });

  it("emissão: compra com a nossa referência, espera o eSIM e entrega sem links do fornecedor", async () => {
    let polls = 0;
    const api = fakeApi((c) => {
      if (c.path.startsWith("/order/list")) return { data: { list: [] } };
      if (c.path === `/package/${PKG.code}`) return { data: PKG };
      if (c.method === "POST" && c.path === "/order/purchase") return { data: { order_id: "O1", customer_order_id: "SUB12-1", status: "PENDING", packages: [{ package_code: PKG.code, qty: 2 }], balance_after: 9000 } };
      if (c.path === "/order/O1") return { data: { order_id: "O1", status: ++polls >= 2 ? "COMPLETED" : "HANDLING", packages: [{ qty: 2 }] } };
      if (c.path.startsWith("/esim/list?order_id=O1")) return { data: { list: [ESIM, { ...ESIM, esim_id: "E2" }] } };
    });
    const a = createEsimxAdapter(cfg, { transport: api.transport, waitMs: 5_000, pollMs: 1 });
    const r = await a.book({ quoteRef: null, productId: PKG.code, optionId: PKG.code, pax: { adults: 0, children: 0, units: 2 }, reference: "SUB12-1", maxCost: { currency: "USD", amount: "10.96" } }, { travelers: [] });
    expect(r.status).toBe("CONFIRMED");
    expect(r.bookingRef).toBe("O1");
    const post = api.calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ customer_order_id: "SUB12-1", cart_list: [{ package_code: PKG.code, qty: 2 }] });
    const esims = r.payload.esims as { lpa: string; appleLink: string }[];
    expect(esims).toHaveLength(2);
    expect(esims[0].lpa).toBe("LPA:1$smdp.example$ABC123");
    // link da Apple montado por nós (o do fornecedor não é da Apple); QR do fornecedor fica de fora
    expect(esims[0].appleLink).toBe(`https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent("LPA:1$smdp.example$ABC123")}`);
    expect(JSON.stringify(r.payload)).not.toContain("supplier.example");
    expect(r.payload.balanceAfterCents).toBe(9000);
  });

  it("emissão repetida com a mesma referência recupera o pedido, sem comprar de novo", async () => {
    const api = fakeApi((c) => {
      if (c.path.startsWith("/order/list")) return { data: { list: [{ order_id: "O1", customer_order_id: "sub12-1", status: "COMPLETED", packages: [{ qty: 1 }] }] } };
      if (c.path.startsWith("/esim/list")) return { data: { list: [ESIM] } };
    });
    const r = await createEsimxAdapter(cfg, { transport: api.transport }).book({ quoteRef: null, productId: PKG.code, optionId: null, pax: { adults: 0, children: 0, units: 1 }, reference: "SUB12-1" }, { travelers: [] });
    expect(r.status).toBe("CONFIRMED");
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("nunca compra acima do custo vendido", async () => {
    const api = fakeApi((c) => (c.path.startsWith("/order/list") ? { data: { list: [] } } : c.path === `/package/${PKG.code}` ? { data: { ...PKG, amount: 700 } } : undefined));
    const a = createEsimxAdapter(cfg, { transport: api.transport });
    await expect(a.book({ quoteRef: null, productId: PKG.code, optionId: null, pax: { adults: 0, children: 0, units: 1 }, reference: "SUB1-1", maxCost: { currency: "USD", amount: "5.48" } }, { travelers: [] })).rejects.toThrow(/aumentou o preço/);
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("sem saldo: erro claro para a equipe (com o saldo atual)", async () => {
    const api = fakeApi((c) => {
      if (c.path.startsWith("/order/list")) return { data: { list: [] } };
      if (c.path === `/package/${PKG.code}`) return { data: PKG };
      if (c.path === "/order/purchase") return { code: 50001 };
      if (c.path === "/organization/balance") return { data: { balance: 120 } };
    });
    const e = await createEsimxAdapter(cfg, { transport: api.transport })
      .book({ quoteRef: null, productId: PKG.code, optionId: null, pax: { adults: 0, children: 0, units: 1 }, reference: "SUB1-1" }, { travelers: [] })
      .catch((x) => x);
    expect(e).toBeInstanceOf(SupplierError);
    expect(e.message).toMatch(/Saldo insuficiente.*US\$ 1\.20/);
  });

  it("serviço ocupado (503): repete uma vez com a mesma referência", async () => {
    let posts = 0;
    const api = fakeApi((c) => {
      if (c.path.startsWith("/order/list")) return { data: { list: [] } };
      if (c.path === `/package/${PKG.code}`) return { data: PKG };
      if (c.path === "/order/purchase") return ++posts === 1 ? { code: 503 } : { data: { order_id: "O9", status: "COMPLETED", packages: [{ qty: 1 }] } };
      if (c.path.startsWith("/esim/list")) return { data: { list: [ESIM] } };
    });
    const r = await createEsimxAdapter(cfg, { transport: api.transport }).book({ quoteRef: null, productId: PKG.code, optionId: null, pax: { adults: 0, children: 0, units: 1 }, reference: "SUB7-2" }, { travelers: [] });
    expect(r.status).toBe("CONFIRMED");
    const bodies = api.calls.filter((c) => c.method === "POST").map((c) => JSON.stringify(c.body));
    expect(bodies).toHaveLength(2);
    expect(new Set(bodies).size).toBe(1);
  }, 10_000);

  it("eSIM ainda não pronto: volta PENDING (a página do pedido consulta de novo)", async () => {
    const api = fakeApi((c) => {
      if (c.path.startsWith("/order/list")) return { data: { list: [] } };
      if (c.path === `/package/${PKG.code}`) return { data: PKG };
      if (c.path === "/order/purchase") return { data: { order_id: "O2", status: "PENDING", packages: [{ qty: 1 }] } };
      if (c.path === "/order/O2") return { data: { order_id: "O2", status: "HANDLING" } };
    });
    const r = await createEsimxAdapter(cfg, { transport: api.transport, waitMs: 20, pollMs: 5 }).book({ quoteRef: null, productId: PKG.code, optionId: null, pax: { adults: 0, children: 0, units: 1 }, reference: "SUB2-1" }, { travelers: [] });
    expect(r.status).toBe("PENDING");
    expect(r.bookingRef).toBe("O2");
  });

  it("cancelamento só antes de ativar, com reembolso ao saldo", async () => {
    const ok = fakeApi((c) => (c.path.startsWith("/esim/list") ? { data: { list: [ESIM] } } : c.path === "/esim/E1/cancel" ? { data: { refund_amount: 548 } } : undefined));
    const r = await createEsimxAdapter(cfg, { transport: ok.transport }).cancelBooking!("O1", { simulate: false });
    expect(r).toMatchObject({ status: "CANCELLED", payload: { refundCents: 548 } });
    const active = fakeApi((c) => (c.path.startsWith("/esim/list") ? { data: { list: [{ ...ESIM, status: "ACTIVE" }] } } : c.path === "/esim/E1/cancel" ? { code: 50301 } : undefined));
    await expect(createEsimxAdapter(cfg, { transport: active.transport }).cancelBooking!("O1", { simulate: false })).rejects.toThrow(/antes de ser ativado/);
  });

  it("regras pequenas", () => {
    expect(customerOrderId("SUB12-1")).toBe("SUB12-1");
    expect(customerOrderId("a b/c")).toBe("a-b-c");
    expect(orderStatus({ status: "COMPLETED" }, 2, 2)).toBe("CONFIRMED");
    expect(orderStatus({ status: "COMPLETED" }, 1, 2)).toBe("PENDING");
    expect(orderStatus({ status: "REFUNDED" }, 0, 1)).toBe("CANCELLED");
    expect(orderStatus({ status: "CLOSED" }, 0, 1)).toBe("REJECTED");
    expect(appleInstallLink({ apple_link: "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=X" })).toBe("https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=X");
    expect(appleInstallLink({})).toBeNull();
  });
});
