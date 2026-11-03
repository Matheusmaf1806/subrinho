import type { Currency, PaxConfig, PriceLine } from "@/server/db/schema";
import { type OfferOption, type PaxRule, type ProductDetail, type ProductSummary, type SupplierAdapter, SupplierError } from "../types";
import { bookingRef, defaultDate, dynamicFactor, expiresAtFor, matchesDestination, money4, quoteRef } from "./util";
import { photo, type PhotoKey } from "@/lib/images";

type TicketOption = {
  id: string;
  title: string;
  description: string;
  adult: number;
  child?: number;
};

type TicketProduct = {
  id: string;
  image: PhotoKey;
  title: string;
  subtitle: string;
  destination: string;
  location: string;
  description: string;
  highlights: string[];
  rating: number;
  tags: string[];
  childLabel: string;
  duration: string;
  options: TicketOption[];
};

export const TU_EXPERIENZA_CATALOG: TicketProduct[] = [
  {
    id: "colosseo",
    image: "colosseumAerial",
    title: "Coliseu, Fórum Romano e Palatino",
    subtitle: "Entrada com horário marcado",
    destination: "Roma",
    location: "Roma, Itália",
    description:
      "Visite o maior anfiteatro do mundo antigo e caminhe pelo Fórum Romano e pelo Monte Palatino, o coração da Roma Imperial.",
    highlights: ["Entrada sem fila com horário marcado", "Fórum Romano e Palatino inclusos", "Audioguia em português (opcional)"],
    rating: 4.8,
    tags: ["Mais vendido", "Cancelamento grátis até 24h"],
    childLabel: "Criança (6 a 17 anos)",
    duration: "3 horas",
    options: [
      { id: "colosseo-1d", title: "Coliseu 1 dia", description: "Coliseu + Fórum Romano + Palatino, válido por 1 dia.", adult: 24, child: 4 },
      { id: "colosseo-arena", title: "Coliseu com acesso à Arena", description: "Acesso ao piso da Arena onde lutavam os gladiadores.", adult: 32, child: 8 },
      {
        id: "colosseo-vaticano",
        title: "Coliseu + Vaticano",
        description: "Combo Coliseu 1 dia + Museus Vaticanos e Capela Sistina.",
        adult: 62,
        child: 30,
      },
    ],
  },
  {
    id: "vaticano",
    image: "vatican",
    title: "Museus Vaticanos e Capela Sistina",
    subtitle: "Ingresso sem fila",
    destination: "Roma",
    location: "Cidade do Vaticano",
    description: "Os Museus Vaticanos abrigam uma das maiores coleções de arte do mundo, culminando na Capela Sistina de Michelangelo.",
    highlights: ["Entrada sem fila", "Capela Sistina", "Galeria dos Mapas"],
    rating: 4.7,
    tags: ["Sem fila"],
    childLabel: "Criança (6 a 17 anos)",
    duration: "3 horas",
    options: [
      { id: "vaticano-entrada", title: "Entrada sem fila", description: "Ingresso com horário marcado.", adult: 34, child: 18 },
      { id: "vaticano-guiado", title: "Tour guiado em português", description: "Guia credenciado em português, grupos pequenos.", adult: 69, child: 49 },
    ],
  },
  {
    id: "uffizi",
    image: "florence",
    title: "Galeria Uffizi",
    subtitle: "Ingresso com horário marcado",
    destination: "Florença",
    location: "Florença, Itália",
    description: "Obras-primas de Botticelli, Leonardo da Vinci, Michelangelo e Rafael em uma das galerias mais famosas do mundo.",
    highlights: ["O Nascimento de Vênus", "Horário marcado", "Audioguia opcional"],
    rating: 4.7,
    tags: [],
    childLabel: "Criança (até 17 anos)",
    duration: "2 horas",
    options: [{ id: "uffizi-entrada", title: "Entrada", description: "Ingresso com horário marcado.", adult: 29, child: 6 }],
  },
  {
    id: "pompeia",
    image: "vernazza",
    title: "Pompeia com transporte saindo de Roma",
    subtitle: "Dia inteiro",
    destination: "Roma",
    location: "Pompeia, Itália",
    description: "Excursão de dia inteiro saindo de Roma até as ruínas de Pompeia, com guia e transporte.",
    highlights: ["Transporte ida e volta", "Guia arqueológico", "Almoço opcional"],
    rating: 4.6,
    tags: ["Dia inteiro"],
    childLabel: "Criança (4 a 12 anos)",
    duration: "12 horas",
    options: [{ id: "pompeia-dia", title: "Excursão dia inteiro", description: "Saída às 7h da Piazza della Repubblica.", adult: 129, child: 99 }],
  },
  {
    id: "duomo-milano",
    image: "milanDuomo",
    title: "Duomo de Milão + Terraços",
    subtitle: "Catedral e terraços",
    destination: "Milão",
    location: "Milão, Itália",
    description: "Acesso à catedral gótica e aos terraços com vista para a cidade.",
    highlights: ["Terraços de elevador", "Museu do Duomo"],
    rating: 4.7,
    tags: [],
    childLabel: "Criança (6 a 17 anos)",
    duration: "2 horas",
    options: [
      { id: "duomo-escada", title: "Terraços pela escada", description: "Catedral + terraços (escada).", adult: 20, child: 10 },
      { id: "duomo-elevador", title: "Terraços pelo elevador", description: "Catedral + terraços (elevador).", adult: 28, child: 14 },
    ],
  },
];

export const NADIO_CATALOG: TicketProduct[] = [
  {
    id: "disney-mk",
    image: "castle",
    title: "Walt Disney World — Ingresso de 1 parque",
    subtitle: "Magic Kingdom, EPCOT, Hollywood Studios ou Animal Kingdom",
    destination: "Orlando",
    location: "Orlando, Flórida",
    description: "Ingresso de data marcada para um dos quatro parques temáticos do Walt Disney World Resort.",
    highlights: ["Data marcada", "Reserva de parque inclusa", "Entrega digital"],
    rating: 4.9,
    tags: ["Mais vendido"],
    childLabel: "Criança (3 a 9 anos)",
    duration: "1 dia",
    options: [
      { id: "disney-1d", title: "1 dia — 1 parque", description: "Um parque por dia.", adult: 159, child: 154 },
      { id: "disney-4d", title: "4 dias — 1 parque por dia", description: "Quatro dias consecutivos.", adult: 529, child: 509 },
      { id: "disney-4d-hopper", title: "4 dias — Park Hopper", description: "Visite mais de um parque no mesmo dia.", adult: 649, child: 629 },
    ],
  },
  {
    id: "universal",
    image: "carousel",
    title: "Universal Orlando Resort",
    subtitle: "Universal Studios, Islands of Adventure e Epic Universe",
    destination: "Orlando",
    location: "Orlando, Flórida",
    description: "Ingressos para os parques da Universal Orlando com opção park-to-park.",
    highlights: ["Hogwarts Express (park-to-park)", "Data marcada"],
    rating: 4.8,
    tags: [],
    childLabel: "Criança (3 a 9 anos)",
    duration: "1 dia",
    options: [
      { id: "universal-1p", title: "1 dia — 1 parque", description: "Um parque.", adult: 139, child: 134 },
      { id: "universal-p2p", title: "1 dia — Park-to-Park", description: "Universal Studios + Islands of Adventure.", adult: 199, child: 194 },
    ],
  },
  {
    id: "empire-state",
    image: "nycSkyline",
    title: "Empire State Building — Observatório",
    subtitle: "86º andar",
    destination: "Nova York",
    location: "Nova York, EUA",
    description: "Vista 360º de Manhattan do observatório mais icônico de Nova York.",
    highlights: ["86º andar", "Museu interativo"],
    rating: 4.7,
    tags: [],
    childLabel: "Criança (6 a 12 anos)",
    duration: "1–2 horas",
    options: [
      { id: "esb-86", title: "Observatório 86º andar", description: "Entrada geral.", adult: 48, child: 42 },
      { id: "esb-102", title: "86º + 102º andar", description: "Inclui o deck superior.", adult: 83, child: 77 },
    ],
  },
  {
    id: "louvre",
    image: "museum",
    title: "Museu do Louvre",
    subtitle: "Entrada com horário marcado",
    destination: "Paris",
    location: "Paris, França",
    description: "O museu mais visitado do mundo, casa da Mona Lisa e da Vênus de Milo.",
    highlights: ["Horário marcado", "Mona Lisa"],
    rating: 4.7,
    tags: [],
    childLabel: "Criança (até 17 anos)",
    duration: "3 horas",
    options: [{ id: "louvre-entrada", title: "Entrada", description: "Ingresso com horário marcado.", adult: 26, child: 0 }],
  },
];

function paxRulesFor(p: TicketProduct, opt?: TicketOption): PaxRule[] {
  const rules: PaxRule[] = [{ type: "ADULT", label: "Adulto", min: 0, max: 20 }];
  if (!opt || opt.child !== undefined) rules.push({ type: "CHILD", label: p.childLabel, min: 0, max: 20 });
  return rules;
}

function linesFor(code: string, opt: TicketOption, p: TicketProduct, pax: PaxConfig, date?: string): PriceLine[] {
  const f = dynamicFactor(`${code}:${opt.id}`, date);
  const lines: PriceLine[] = [];
  if (pax.adults > 0) lines.push({ type: "ADULT", label: "Adulto", unitCost: money4(opt.adult * f), quantity: pax.adults });
  if (pax.children > 0) {
    if (opt.child === undefined) throw new SupplierError("Este ingresso não possui tarifa infantil");
    lines.push({ type: "CHILD", label: p.childLabel, unitCost: money4(opt.child * f), quantity: pax.children });
  }
  return lines;
}

export function createTicketsMock(cfg: { code: string; name: string; currency: Currency; catalog: TicketProduct[] }): SupplierAdapter {
  const find = (id: string) => cfg.catalog.find((p) => p.id === id);
  const summary = (p: TicketProduct, date?: string): ProductSummary => {
    const cheapest = [...p.options].sort((a, b) => a.adult - b.adult)[0];
    return {
      supplierCode: cfg.code,
      supplierName: cfg.name,
      category: "TICKETS",
      productId: p.id,
      title: p.title,
      subtitle: p.subtitle,
      location: p.location,
      destination: p.destination,
      imageUrl: photo(p.image, 900),
      rating: p.rating,
      tags: p.tags,
      currency: cfg.currency,
      lines: linesFor(cfg.code, cheapest, p, { adults: 1, children: 0 }, date),
    };
  };

  return {
    code: cfg.code,
    name: cfg.name,
    category: "TICKETS",
    defaultCurrency: cfg.currency,
    destinations: () => [...new Set(cfg.catalog.map((p) => p.destination))].map((d) => ({ id: d, name: d })),
    async search(params) {
      return cfg.catalog
        .filter((p) => matchesDestination(params.destination, p.destination, p.location, p.title))
        .map((p) => summary(p, params.date));
    },
    async getProduct(productId, params) {
      const p = find(productId);
      if (!p) return null;
      const date = params.date ?? defaultDate(30);
      const pax: PaxConfig = { adults: params.pax?.adults ?? 1, children: params.pax?.children ?? 0 };
      const options: OfferOption[] = p.options.map((o) => ({
        optionId: o.id,
        title: o.title,
        description: o.description,
        currency: cfg.currency,
        lines: linesFor(cfg.code, o, p, { adults: 1, children: 0 }, date),
        attributes: [
          { label: "Adulto", value: `${cfg.currency} ${money4(o.adult * dynamicFactor(`${cfg.code}:${o.id}`, date))}` },
          ...(o.child !== undefined
            ? [{ label: p.childLabel, value: `${cfg.currency} ${money4(o.child * dynamicFactor(`${cfg.code}:${o.id}`, date))}` }]
            : []),
        ],
        available: pax.children === 0 || o.child !== undefined,
      }));
      return {
        ...summary(p, date),
        description: p.description,
        highlights: p.highlights,
        options,
        paxRules: paxRulesFor(p),
        info: [
          { label: "Duração", value: p.duration },
          { label: "Fornecedor", value: cfg.name },
        ],
      };
    },
    async quote(req) {
      const p = find(req.productId);
      const opt = p?.options.find((o) => o.id === req.optionId) ?? p?.options[0];
      if (!p || !opt) throw new SupplierError("Ingresso não encontrado no fornecedor");
      if (!req.date) throw new SupplierError("Informe a data da visita");
      const pax: PaxConfig = { adults: req.pax.adults ?? 0, children: req.pax.children ?? 0 };
      if (pax.adults + pax.children <= 0) throw new SupplierError("Selecione ao menos 1 ingresso");
      const lines = linesFor(cfg.code, opt, p, pax, req.date);
      return {
        supplierCode: cfg.code,
        category: "TICKETS",
        productId: p.id,
        optionId: opt.id,
        title: p.title,
        subtitle: opt.title,
        location: p.location,
        imageUrl: photo(p.image, 900),
        serviceDate: req.date,
        serviceEndDate: null,
        expiresAt: expiresAtFor(req.date),
        currency: cfg.currency,
        lines,
        pax,
        paxRules: paxRulesFor(p, opt),
        details: { duration: p.duration, optionDescription: opt.description },
        quoteRef: quoteRef(cfg.code.slice(0, 3), { p: p.id, o: opt.id, d: req.date, pax }),
      };
    },
    async book() {
      return { bookingRef: bookingRef(cfg.code.slice(0, 2)), status: "CONFIRMED", payload: { mock: true } };
    },
  };
}
