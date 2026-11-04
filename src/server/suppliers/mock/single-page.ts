/** Seguro Viagem e Chip: página única (lista e detalha na mesma página). */
import type { Currency, PaxConfig, PriceLine } from "@/server/db/schema";
import { type OfferOption, type PaxRule, type ProductSummary, type SupplierAdapter, SupplierError } from "../types";
import { bookingRef, defaultDate, expiresAtFor, matchesDestination, money4, nightsBetween, quoteRef } from "./util";
import { addDays } from "@/lib/tz";
import { photo } from "@/lib/images";

// ───────────────────────── Seguro Viagem ─────────────────────────

type InsurancePlan = {
  id: string;
  name: string;
  medical: string;
  luggage: string;
  covid: boolean;
  perDay: number;
  regions: string[]; // "Europa", "América do Norte", "Mundo", "América do Sul"
};

export const INSURANCE_REGIONS = ["Europa", "América do Norte", "América do Sul", "Mundo"];

export const INTERMAC_PLANS: InsurancePlan[] = [
  { id: "im-60", name: "Intermac 60", medical: "USD 60.000", luggage: "USD 1.200", covid: true, perDay: 14.9, regions: ["Europa", "América do Sul", "Mundo"] },
  { id: "im-150", name: "Intermac 150", medical: "USD 150.000", luggage: "USD 1.500", covid: true, perDay: 21.9, regions: INSURANCE_REGIONS },
  { id: "im-1mm", name: "Intermac 1 Milhão", medical: "USD 1.000.000", luggage: "USD 2.000", covid: true, perDay: 39.9, regions: INSURANCE_REGIONS },
];

export const HERO_PLANS: InsurancePlan[] = [
  { id: "hero-basic", name: "Hero Essencial", medical: "USD 40.000", luggage: "USD 800", covid: true, perDay: 2.1, regions: ["América do Sul", "Europa"] },
  { id: "hero-plus", name: "Hero Plus", medical: "USD 100.000", luggage: "USD 1.500", covid: true, perDay: 3.6, regions: INSURANCE_REGIONS },
  { id: "hero-max", name: "Hero Max", medical: "USD 500.000", luggage: "USD 2.500", covid: true, perDay: 6.4, regions: INSURANCE_REGIONS },
];

const INSURANCE_PAX: PaxRule[] = [
  { type: "ADULT", label: "Viajantes até 64 anos", min: 0, max: 15 },
  { type: "SENIOR", label: "Viajantes de 65 a 85 anos", min: 0, max: 10, hint: "Tarifa com acréscimo de 80%" },
];

export function createInsuranceMock(cfg: { code: string; name: string; currency: Currency; plans: InsurancePlan[] }): SupplierAdapter {
  const lines = (p: InsurancePlan, days: number, pax: PaxConfig): PriceLine[] => {
    const out: PriceLine[] = [];
    if (pax.adults > 0) out.push({ type: "ADULT", label: `Viajante até 64 anos · ${days} dias`, unitCost: money4(p.perDay * days), quantity: pax.adults });
    if ((pax.seniors ?? 0) > 0)
      out.push({ type: "SENIOR", label: `Viajante 65 a 85 anos · ${days} dias`, unitCost: money4(p.perDay * days * 1.8), quantity: pax.seniors! });
    return out;
  };
  const range = (p: { startDate?: string; endDate?: string }) => {
    const startDate = p.startDate ?? defaultDate(30);
    const endDate = p.endDate && p.endDate >= startDate ? p.endDate : addDays(startDate, 9);
    return { startDate, endDate, days: nightsBetween(startDate, endDate) + 1 };
  };
  const toSummary = (p: InsurancePlan, region: string, days: number, pax: PaxConfig): ProductSummary => ({
    supplierCode: cfg.code,
    supplierName: cfg.name,
    category: "INSURANCE",
    productId: p.id,
    title: p.name,
    subtitle: `Despesas médicas ${p.medical} · Bagagem ${p.luggage}`,
    location: region,
    destination: region,
    imageUrl: photo("airportLounge", 900),
    tags: [p.covid ? "Cobertura COVID-19" : "", `Médico ${p.medical}`].filter(Boolean),
    currency: cfg.currency,
    lines: lines(p, days, pax),
  });

  return {
    code: cfg.code,
    name: cfg.name,
    category: "INSURANCE",
    defaultCurrency: cfg.currency,
    destinations: () => INSURANCE_REGIONS.map((r) => ({ id: r, name: r })),
    async search(params) {
      const region = params.destination || "Europa";
      const { days } = range(params);
      const pax: PaxConfig = { adults: params.pax?.adults ?? 1, children: 0, seniors: params.pax?.seniors ?? 0 };
      if (pax.adults + (pax.seniors ?? 0) === 0) pax.adults = 1;
      return cfg.plans.filter((p) => p.regions.some((r) => matchesDestination(region, r))).map((p) => toSummary(p, region, days, pax));
    },
    async getProduct(id, params) {
      const p = cfg.plans.find((x) => x.id === id);
      if (!p) return null;
      const region = params.destination || "Europa";
      const { days } = range(params);
      const pax: PaxConfig = { adults: params.pax?.adults ?? 1, children: 0, seniors: params.pax?.seniors ?? 0 };
      const option: OfferOption = {
        optionId: region,
        title: `${p.name} · ${region}`,
        currency: cfg.currency,
        lines: lines(p, days, pax),
        attributes: [
          { label: "Despesas médicas", value: p.medical },
          { label: "Bagagem", value: p.luggage },
        ],
        available: true,
      };
      return {
        ...toSummary(p, region, days, pax),
        description: `Seguro viagem ${p.name} com cobertura de despesas médicas e hospitalares de ${p.medical}.`,
        highlights: [`Despesas médicas ${p.medical}`, `Extravio de bagagem ${p.luggage}`, "Assistência 24h em português"],
        options: [option],
        paxRules: INSURANCE_PAX,
        info: [],
      };
    },
    async quote(req) {
      const p = cfg.plans.find((x) => x.id === req.productId);
      if (!p) throw new SupplierError("Plano não encontrado");
      if (!req.startDate || !req.endDate || req.endDate < req.startDate) throw new SupplierError("Período da viagem inválido");
      const days = nightsBetween(req.startDate, req.endDate) + 1;
      const pax: PaxConfig = { adults: req.pax.adults ?? 0, children: 0, seniors: req.pax.seniors ?? 0 };
      if (pax.adults + (pax.seniors ?? 0) <= 0) throw new SupplierError("Informe ao menos 1 viajante");
      const region = req.optionId ?? "Mundo";
      return {
        supplierCode: cfg.code,
        category: "INSURANCE",
        productId: p.id,
        optionId: region,
        title: `Seguro Viagem ${p.name}`,
        subtitle: `${region} · ${days} dias · ${pax.adults + (pax.seniors ?? 0)} viajante(s)`,
        location: region,
        imageUrl: photo("planeWing", 900),
        serviceDate: req.startDate,
        serviceEndDate: req.endDate,
        expiresAt: expiresAtFor(req.startDate),
        currency: cfg.currency,
        lines: lines(p, days, pax),
        pax,
        paxRules: INSURANCE_PAX,
        details: { medical: p.medical, luggage: p.luggage, days, region },
        quoteRef: quoteRef(cfg.code.slice(0, 3), { p: p.id, s: req.startDate, e: req.endDate, pax }),
      };
    },
    async book() {
      return { bookingRef: bookingRef("SV"), status: "ISSUED", payload: { mock: true, voucher: "emitido" } };
    },
  };
}

// ───────────────────────── Chip / eSIM ─────────────────────────

type EsimPlan = { id: string; region: string; data: string; days: number; usd: number; countries: string[] };

export const ESIMX_PLANS: EsimPlan[] = [
  { id: "eu-5", region: "Europa", data: "5 GB", days: 10, usd: 12, countries: ["Itália", "França", "Portugal", "Espanha", "Alemanha"] },
  { id: "eu-10", region: "Europa", data: "10 GB", days: 15, usd: 19, countries: ["Itália", "França", "Portugal", "Espanha", "Alemanha"] },
  { id: "eu-20", region: "Europa", data: "20 GB", days: 30, usd: 29, countries: ["Itália", "França", "Portugal", "Espanha", "Alemanha"] },
  { id: "us-10", region: "Estados Unidos", data: "10 GB", days: 15, usd: 17, countries: ["Estados Unidos"] },
  { id: "us-unl", region: "Estados Unidos", data: "Ilimitado", days: 30, usd: 45, countries: ["Estados Unidos"] },
  { id: "gl-5", region: "Global", data: "5 GB", days: 15, usd: 32, countries: ["+120 países"] },
];

const CHIP_PAX: PaxRule[] = [{ type: "UNIT", label: "Quantidade de chips", min: 1, max: 20 }];

export function createEsimMock(cfg: { code: string; name: string; currency: Currency }): SupplierAdapter {
  const lines = (p: EsimPlan, units: number): PriceLine[] => [
    { type: "UNIT", label: `eSIM ${p.region} ${p.data} · ${p.days} dias`, unitCost: money4(p.usd), quantity: units },
  ];
  const toSummary = (p: EsimPlan): ProductSummary => ({
    supplierCode: cfg.code,
    supplierName: cfg.name,
    category: "CHIP",
    productId: p.id,
    title: `eSIM ${p.region} · ${p.data}`,
    subtitle: `${p.days} dias · ${p.countries.join(", ")}`,
    location: p.region,
    destination: p.region,
    imageUrl: photo("phone", 900),
    tags: ["Ativação imediata", "Entrega por e-mail"],
    currency: cfg.currency,
    lines: lines(p, 1),
  });
  return {
    code: cfg.code,
    name: cfg.name,
    category: "CHIP",
    defaultCurrency: cfg.currency,
    destinations: () => [...new Set(ESIMX_PLANS.map((p) => p.region))].map((r) => ({ id: r, name: r })),
    async search(params) {
      return ESIMX_PLANS.filter((p) => matchesDestination(params.destination, p.region, ...p.countries)).map(toSummary);
    },
    async getProduct(id) {
      const p = ESIMX_PLANS.find((x) => x.id === id);
      if (!p) return null;
      return {
        ...toSummary(p),
        description: `Internet ${p.data} por ${p.days} dias em ${p.countries.join(", ")}.`,
        highlights: ["QR Code por e-mail", "Compatível com iPhone XS+ e Android com eSIM"],
        options: [{ optionId: p.id, title: `${p.data} · ${p.days} dias`, currency: cfg.currency, lines: lines(p, 1), available: true }],
        paxRules: CHIP_PAX,
        info: [],
      };
    },
    async quote(req) {
      const p = ESIMX_PLANS.find((x) => x.id === req.productId);
      if (!p) throw new SupplierError("Plano de eSIM não encontrado");
      const units = Math.max(1, req.pax.units ?? 1);
      return {
        supplierCode: cfg.code,
        category: "CHIP",
        productId: p.id,
        optionId: p.id,
        title: `eSIM ${p.region} · ${p.data}`,
        subtitle: `${p.days} dias · ${units} chip(s)`,
        location: p.region,
        imageUrl: photo("phone", 900),
        serviceDate: req.startDate ?? null,
        serviceEndDate: null,
        // eSIM pode ser ativado depois: só expira se houver data de início informada.
        expiresAt: expiresAtFor(req.startDate),
        currency: cfg.currency,
        lines: lines(p, units),
        pax: { adults: 0, children: 0, units },
        paxRules: CHIP_PAX,
        details: { data: p.data, days: p.days, countries: p.countries },
        quoteRef: quoteRef("ESX", { p: p.id, units }),
      };
    },
    async book() {
      return { bookingRef: bookingRef("ES"), status: "ISSUED", payload: { mock: true, qrCode: "enviado por e-mail" } };
    },
  };
}
