import type { Category, Currency, PaxConfig, PriceLine } from "@/server/db/schema";
import { type OfferOption, type PaxRule, type ProductDetail, type ProductSummary, type SupplierAdapter, SupplierError } from "../types";
import { bookingRef, defaultDate, dynamicFactor, expiresAtFor, hash, matchesDestination, money4, nightsBetween, quoteRef } from "./util";
import { addDays } from "@/lib/tz";

/** Conversão interna do mock para gerar tarifas "nativas" de cada fornecedor. */
const FROM_USD: Record<Currency, number> = { USD: 1, EUR: 0.92, BRL: 5.1 };

type Room = { id: string; name: string; baseUsd: number; maxGuests: number; beds: string };
type Hotel = {
  key: string;
  name: string;
  destination: string;
  location: string;
  stars: number;
  rating: number;
  description: string;
  amenities: string[];
  rooms: Room[];
  /** fornecedores que vendem este hotel e fator de preço de cada um */
  offeredBy: Record<string, number>;
};

export const HOTELS: Hotel[] = [
  {
    key: "orl-lakeside",
    name: "Lakeside Resort Orlando",
    destination: "Orlando",
    location: "Lake Buena Vista, Orlando",
    stars: 4,
    rating: 8.7,
    description: "Resort a 5 minutos de Disney Springs, com piscinas aquecidas e transporte gratuito para os parques.",
    amenities: ["Piscina", "Transfer para os parques", "Wi-Fi", "Estacionamento"],
    rooms: [
      { id: "std", name: "Standard 2 camas queen", baseUsd: 139, maxGuests: 4, beds: "2 camas queen" },
      { id: "fam", name: "Suíte Família", baseUsd: 219, maxGuests: 6, beds: "1 king + sofá-cama + beliche" },
    ],
    offeredBy: { GGT_BEST_BUY: 1.0, RATEHAWK: 1.03, HOTELBEDS: 0.99 },
  },
  {
    key: "orl-universal-blvd",
    name: "Universal Boulevard Suites",
    destination: "Orlando",
    location: "International Drive, Orlando",
    stars: 3,
    rating: 8.2,
    description: "Suítes amplas na International Drive, a poucos minutos da Universal Orlando.",
    amenities: ["Café da manhã", "Piscina", "Cozinha"],
    rooms: [
      { id: "suite", name: "Suíte 2 quartos", baseUsd: 169, maxGuests: 6, beds: "2 queen + 1 king" },
      { id: "studio", name: "Studio", baseUsd: 109, maxGuests: 3, beds: "1 queen + sofá-cama" },
    ],
    offeredBy: { GGT_BEST_BUY: 0.97, RATEHAWK: 1.0 },
  },
  {
    key: "rom-trevi",
    name: "Palazzo Trevi Boutique Hotel",
    destination: "Roma",
    location: "Centro Histórico, Roma",
    stars: 4,
    rating: 9.1,
    description: "Hotel boutique a 200 metros da Fontana di Trevi, em um palazzo do século XVIII.",
    amenities: ["Café da manhã", "Terraço", "Wi-Fi"],
    rooms: [
      { id: "dbl", name: "Duplo Clássico", baseUsd: 189, maxGuests: 2, beds: "1 casal" },
      { id: "sup", name: "Superior com vista", baseUsd: 259, maxGuests: 3, beds: "1 casal + 1 solteiro" },
    ],
    offeredBy: { HOTELBEDS: 1.0, RATEHAWK: 1.05 },
  },
  {
    key: "rom-vaticano",
    name: "Hotel San Pietro Vaticano",
    destination: "Roma",
    location: "Prati, Roma",
    stars: 3,
    rating: 8.4,
    description: "A 10 minutos a pé da Basílica de São Pedro e dos Museus Vaticanos.",
    amenities: ["Café da manhã", "Recepção 24h"],
    rooms: [
      { id: "dbl", name: "Duplo Standard", baseUsd: 129, maxGuests: 2, beds: "1 casal" },
      { id: "tpl", name: "Triplo", baseUsd: 169, maxGuests: 3, beds: "3 solteiro" },
    ],
    offeredBy: { HOTELBEDS: 1.0, GGT_BEST_BUY: 1.02 },
  },
  {
    key: "par-marais",
    name: "Hôtel Le Marais Lumière",
    destination: "Paris",
    location: "Le Marais, Paris",
    stars: 4,
    rating: 8.9,
    description: "Charmoso hotel no Marais, perto do Centre Pompidou e da Place des Vosges.",
    amenities: ["Wi-Fi", "Bar", "Ar-condicionado"],
    rooms: [
      { id: "dbl", name: "Duplo Supérieure", baseUsd: 239, maxGuests: 2, beds: "1 casal" },
      { id: "jr", name: "Júnior Suíte", baseUsd: 329, maxGuests: 3, beds: "1 king + sofá" },
    ],
    offeredBy: { HOTELBEDS: 1.0, RATEHAWK: 0.98 },
  },
  {
    key: "lis-chiado",
    name: "Chiado Prime Lisboa",
    destination: "Lisboa",
    location: "Chiado, Lisboa",
    stars: 4,
    rating: 9.0,
    description: "No coração do Chiado, entre a Baixa e o Bairro Alto.",
    amenities: ["Café da manhã", "Rooftop", "Wi-Fi"],
    rooms: [
      { id: "dbl", name: "Duplo Deluxe", baseUsd: 159, maxGuests: 2, beds: "1 casal" },
      { id: "fam", name: "Família", baseUsd: 229, maxGuests: 4, beds: "1 casal + 2 solteiro" },
    ],
    offeredBy: { RATEHAWK: 1.0, HOTELBEDS: 1.01, GGT_BEST_BUY: 1.04 },
  },
  {
    key: "nyc-midtown",
    name: "Midtown Times Square Hotel",
    destination: "Nova York",
    location: "Midtown, Manhattan",
    stars: 4,
    rating: 8.5,
    description: "A duas quadras da Times Square e próximo à Broadway.",
    amenities: ["Academia", "Wi-Fi", "Bar"],
    rooms: [
      { id: "qq", name: "Duas camas queen", baseUsd: 289, maxGuests: 4, beds: "2 queen" },
      { id: "k", name: "King", baseUsd: 259, maxGuests: 2, beds: "1 king" },
    ],
    offeredBy: { GGT_BEST_BUY: 1.0, RATEHAWK: 1.02 },
  },
];

const BOARDS = [
  { id: "ro", name: "Somente hospedagem", factor: 1 },
  { id: "bb", name: "Café da manhã", factor: 1.12 },
];

function nightly(code: string, h: Hotel, room: Room, board: (typeof BOARDS)[number], currency: Currency, pax: PaxConfig, date?: string) {
  const rooms = Math.max(1, pax.rooms ?? 1);
  const adultsPerRoom = Math.ceil(pax.adults / rooms);
  const childrenPerRoom = Math.ceil(pax.children / rooms);
  const extraAdults = Math.max(0, adultsPerRoom - 2);
  const occupancy = 1 + extraAdults * 0.15 + childrenPerRoom * 0.08;
  const base = room.baseUsd * (h.offeredBy[code] ?? 1) * FROM_USD[currency];
  return base * board.factor * occupancy * dynamicFactor(`${code}:${h.key}:${room.id}`, date);
}

function hotelPaxRules(): PaxRule[] {
  return [
    { type: "ROOM", label: "Quartos", min: 1, max: 5 },
    { type: "ADULT", label: "Adultos", min: 1, max: 12 },
    { type: "CHILD", label: "Crianças (até 11 anos)", min: 0, max: 8 },
  ];
}

function validateOccupancy(room: Room, pax: PaxConfig) {
  const rooms = Math.max(1, pax.rooms ?? 1);
  const perRoom = Math.ceil((pax.adults + pax.children) / rooms);
  if (pax.adults < rooms) throw new SupplierError("Cada quarto precisa de ao menos 1 adulto");
  if (perRoom > room.maxGuests) throw new SupplierError(`O quarto ${room.name} acomoda até ${room.maxGuests} pessoas`);
}

export function createHotelsMock(cfg: { code: string; name: string; currency: Currency }): SupplierAdapter {
  const hotels = HOTELS.filter((h) => h.offeredBy[cfg.code] !== undefined);
  const productId = (h: Hotel) => `${cfg.code.toLowerCase()}-${h.key}`;
  const findHotel = (id: string) => hotels.find((h) => productId(h) === id);

  function lines(h: Hotel, room: Room, board: (typeof BOARDS)[number], pax: PaxConfig, checkIn: string, checkOut: string): PriceLine[] {
    const nights = nightsBetween(checkIn, checkOut);
    const rooms = Math.max(1, pax.rooms ?? 1);
    return [
      {
        type: "NIGHT",
        label: `Diária ${room.name} · ${board.name}`,
        unitCost: money4(nightly(cfg.code, h, room, board, cfg.currency, pax, checkIn)),
        quantity: nights * rooms,
      },
    ];
  }

  function summary(h: Hotel, checkIn: string, checkOut: string, pax: PaxConfig): ProductSummary {
    const room = [...h.rooms].sort((a, b) => a.baseUsd - b.baseUsd)[0];
    return {
      supplierCode: cfg.code,
      supplierName: cfg.name,
      category: "LODGING",
      productId: productId(h),
      title: h.name,
      subtitle: `${"★".repeat(h.stars)} · ${h.amenities.slice(0, 2).join(" · ")}`,
      location: h.location,
      destination: h.destination,
      rating: h.rating,
      tags: h.amenities,
      currency: cfg.currency,
      lines: lines(h, room, BOARDS[0], { ...pax, adults: Math.min(pax.adults, room.maxGuests) }, checkIn, checkOut),
      groupKey: h.key,
    };
  }

  const defaults = (p: { checkIn?: string; checkOut?: string; pax?: Partial<PaxConfig> }) => {
    const checkIn = p.checkIn ?? defaultDate(45);
    const checkOut = p.checkOut && p.checkOut > checkIn ? p.checkOut : addDays(checkIn, 5);
    const pax: PaxConfig = { adults: p.pax?.adults ?? 2, children: p.pax?.children ?? 0, rooms: p.pax?.rooms ?? 1 };
    return { checkIn, checkOut, pax };
  };

  return {
    code: cfg.code,
    name: cfg.name,
    category: "LODGING" as Category,
    defaultCurrency: cfg.currency,
    destinations: () => [...new Set(hotels.map((h) => h.destination))].map((d) => ({ id: d, name: d })),
    async search(params) {
      const { checkIn, checkOut, pax } = defaults(params);
      return hotels
        .filter((h) => matchesDestination(params.destination, h.destination, h.location, h.name))
        .map((h) => summary(h, checkIn, checkOut, pax));
    },
    async getProduct(id, params) {
      const h = findHotel(id);
      if (!h) return null;
      const { checkIn, checkOut, pax } = defaults(params);
      const options: OfferOption[] = [];
      for (const room of h.rooms) {
        for (const board of BOARDS) {
          let available = true;
          try {
            validateOccupancy(room, pax);
          } catch {
            available = false;
          }
          options.push({
            optionId: `${room.id}-${board.id}`,
            title: `${room.name} — ${board.name}`,
            description: `${room.beds} · até ${room.maxGuests} pessoas`,
            currency: cfg.currency,
            lines: lines(h, room, board, pax, checkIn, checkOut),
            attributes: [
              { label: "Regime", value: board.name },
              { label: "Cancelamento", value: hash(room.id + board.id) % 2 ? "Grátis até 7 dias antes" : "Não reembolsável" },
            ],
            available,
          });
        }
      }
      return {
        ...summary(h, checkIn, checkOut, pax),
        description: h.description,
        highlights: h.amenities,
        options,
        paxRules: hotelPaxRules(),
        info: [
          { label: "Categoria", value: `${h.stars} estrelas` },
          { label: "Nota dos hóspedes", value: h.rating.toFixed(1) },
          { label: "Check-in / Check-out", value: "15h / 11h" },
          { label: "Fornecedor", value: cfg.name },
        ],
      };
    },
    async quote(req) {
      const h = findHotel(req.productId);
      if (!h) throw new SupplierError("Hotel não encontrado no fornecedor");
      const [roomId, boardId] = (req.optionId ?? "").split("-");
      const room = h.rooms.find((r) => r.id === roomId);
      const board = BOARDS.find((b) => b.id === boardId);
      if (!room || !board) throw new SupplierError("Quarto indisponível");
      if (!req.checkIn || !req.checkOut || req.checkOut <= req.checkIn) throw new SupplierError("Datas de hospedagem inválidas");
      const pax: PaxConfig = { adults: req.pax.adults, children: req.pax.children ?? 0, rooms: Math.max(1, req.pax.rooms ?? 1) };
      validateOccupancy(room, pax);
      const nights = nightsBetween(req.checkIn, req.checkOut);
      return {
        supplierCode: cfg.code,
        category: "LODGING",
        productId: req.productId,
        optionId: req.optionId ?? null,
        title: h.name,
        subtitle: `${room.name} · ${board.name} · ${nights} noite${nights > 1 ? "s" : ""}`,
        location: h.location,
        imageUrl: null,
        serviceDate: req.checkIn,
        serviceEndDate: req.checkOut,
        expiresAt: expiresAtFor(req.checkIn),
        currency: cfg.currency,
        lines: lines(h, room, board, pax, req.checkIn, req.checkOut),
        pax,
        paxRules: hotelPaxRules(),
        details: { hotelKey: h.key, room: room.name, board: board.name, nights, beds: room.beds, stars: h.stars },
        quoteRef: quoteRef(cfg.code.slice(0, 3), { h: h.key, o: req.optionId, ci: req.checkIn, co: req.checkOut, pax }),
      };
    },
    async book() {
      return { bookingRef: bookingRef("HT"), status: "CONFIRMED", payload: { mock: true } };
    },
  };
}

// ───────────────────────── Casas ─────────────────────────

type House = {
  id: string;
  name: string;
  destination: string;
  location: string;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  nightlyUsd: number;
  cleaningUsd: number;
  minNights: number;
  description: string;
  amenities: string[];
  rating: number;
};

export const HOUSES_MVH: House[] = [
  {
    id: "windsor-hills-5",
    name: "Casa 5 quartos com piscina — Windsor Hills",
    destination: "Orlando",
    location: "Windsor Hills, Kissimmee",
    bedrooms: 5,
    bathrooms: 4,
    maxGuests: 12,
    nightlyUsd: 289,
    cleaningUsd: 250,
    minNights: 3,
    description: "Condomínio fechado a 2,5 km da Disney, piscina privativa aquecida, sala de jogos e quarto temático.",
    amenities: ["Piscina privativa", "Sala de jogos", "Quarto temático", "Condomínio fechado"],
    rating: 4.9,
  },
  {
    id: "solterra-7",
    name: "Casa 7 quartos — Solterra Resort",
    destination: "Orlando",
    location: "Solterra Resort, Davenport",
    bedrooms: 7,
    bathrooms: 5,
    maxGuests: 16,
    nightlyUsd: 399,
    cleaningUsd: 320,
    minNights: 4,
    description: "Ideal para grupos grandes: piscina com spa, cinema em casa e acesso ao clube do resort.",
    amenities: ["Piscina com spa", "Cinema", "Clube do resort"],
    rating: 4.8,
  },
];

export const HOUSES_MAPRO: House[] = [
  {
    id: "storey-lake-4",
    name: "Townhouse 4 quartos — Storey Lake",
    destination: "Orlando",
    location: "Storey Lake, Kissimmee",
    bedrooms: 4,
    bathrooms: 3,
    maxGuests: 10,
    nightlyUsd: 199,
    cleaningUsd: 180,
    minNights: 3,
    description: "Townhouse com piscina privativa em resort com parque aquático e lazy river.",
    amenities: ["Piscina privativa", "Parque aquático", "Lazy river"],
    rating: 4.7,
  },
  {
    id: "champions-gate-6",
    name: "Casa 6 quartos — ChampionsGate",
    destination: "Orlando",
    location: "ChampionsGate, Davenport",
    bedrooms: 6,
    bathrooms: 5,
    maxGuests: 14,
    nightlyUsd: 329,
    cleaningUsd: 290,
    minNights: 4,
    description: "Casa espaçosa com piscina, área gourmet e acesso ao Oasis Club.",
    amenities: ["Piscina", "Área gourmet", "Oasis Club"],
    rating: 4.8,
  },
];

function housePaxRules(h: House): PaxRule[] {
  return [
    { type: "ADULT", label: "Adultos", min: 1, max: h.maxGuests },
    { type: "CHILD", label: "Crianças", min: 0, max: h.maxGuests - 1 },
  ];
}

export function createHousesMock(cfg: { code: string; name: string; currency: Currency; catalog: House[] }): SupplierAdapter {
  const find = (id: string) => cfg.catalog.find((h) => h.id === id);
  const conv = FROM_USD[cfg.currency];

  function lines(h: House, checkIn: string, checkOut: string): PriceLine[] {
    const nights = nightsBetween(checkIn, checkOut);
    return [
      { type: "NIGHT", label: "Diária da casa", unitCost: money4(h.nightlyUsd * conv * dynamicFactor(`${cfg.code}:${h.id}`, checkIn)), quantity: nights },
      { type: "FEE", label: "Taxa de limpeza", unitCost: money4(h.cleaningUsd * conv), quantity: 1 },
    ];
  }
  const defaults = (p: { checkIn?: string; checkOut?: string; pax?: Partial<PaxConfig> }) => {
    const checkIn = p.checkIn ?? defaultDate(45);
    const checkOut = p.checkOut && p.checkOut > checkIn ? p.checkOut : addDays(checkIn, 7);
    const pax: PaxConfig = { adults: p.pax?.adults ?? 2, children: p.pax?.children ?? 0 };
    return { checkIn, checkOut, pax };
  };
  const summary = (h: House, checkIn: string, checkOut: string): ProductSummary => ({
    supplierCode: cfg.code,
    supplierName: cfg.name,
    category: "HOUSES",
    productId: h.id,
    title: h.name,
    subtitle: `${h.bedrooms} quartos · ${h.bathrooms} banheiros · até ${h.maxGuests} hóspedes`,
    location: h.location,
    destination: h.destination,
    rating: h.rating,
    tags: h.amenities,
    currency: cfg.currency,
    lines: lines(h, checkIn, checkOut),
  });

  return {
    code: cfg.code,
    name: cfg.name,
    category: "HOUSES",
    defaultCurrency: cfg.currency,
    destinations: () => [...new Set(cfg.catalog.map((h) => h.destination))].map((d) => ({ id: d, name: d })),
    async search(params) {
      const { checkIn, checkOut, pax } = defaults(params);
      return cfg.catalog
        .filter((h) => matchesDestination(params.destination, h.destination, h.location, h.name))
        .filter((h) => pax.adults + pax.children <= h.maxGuests)
        .map((h) => summary(h, checkIn, checkOut));
    },
    async getProduct(id, params) {
      const h = find(id);
      if (!h) return null;
      const { checkIn, checkOut, pax } = defaults(params);
      const nights = nightsBetween(checkIn, checkOut);
      return {
        ...summary(h, checkIn, checkOut),
        description: h.description,
        highlights: h.amenities,
        options: [
          {
            optionId: "casa-inteira",
            title: "Casa inteira",
            description: `${h.bedrooms} quartos · mínimo de ${h.minNights} noites`,
            currency: cfg.currency,
            lines: lines(h, checkIn, checkOut),
            attributes: [
              { label: "Estadia mínima", value: `${h.minNights} noites` },
              { label: "Taxa de limpeza", value: `${cfg.currency} ${money4(h.cleaningUsd * conv)}` },
            ],
            available: nights >= h.minNights && pax.adults + pax.children <= h.maxGuests,
          },
        ],
        paxRules: housePaxRules(h),
        info: [
          { label: "Quartos", value: String(h.bedrooms) },
          { label: "Banheiros", value: String(h.bathrooms) },
          { label: "Capacidade", value: `${h.maxGuests} hóspedes` },
          { label: "Fornecedor", value: cfg.name },
        ],
      };
    },
    async quote(req) {
      const h = find(req.productId);
      if (!h) throw new SupplierError("Casa não encontrada no fornecedor");
      if (!req.checkIn || !req.checkOut || req.checkOut <= req.checkIn) throw new SupplierError("Datas inválidas");
      const nights = nightsBetween(req.checkIn, req.checkOut);
      if (nights < h.minNights) throw new SupplierError(`Estadia mínima de ${h.minNights} noites`);
      const pax: PaxConfig = { adults: req.pax.adults, children: req.pax.children ?? 0 };
      if (pax.adults < 1) throw new SupplierError("Informe ao menos 1 adulto");
      if (pax.adults + pax.children > h.maxGuests) throw new SupplierError(`A casa acomoda até ${h.maxGuests} hóspedes`);
      return {
        supplierCode: cfg.code,
        category: "HOUSES",
        productId: h.id,
        optionId: "casa-inteira",
        title: h.name,
        subtitle: `${nights} noites · ${pax.adults + pax.children} hóspedes`,
        location: h.location,
        imageUrl: null,
        serviceDate: req.checkIn,
        serviceEndDate: req.checkOut,
        expiresAt: expiresAtFor(req.checkIn),
        currency: cfg.currency,
        lines: lines(h, req.checkIn, req.checkOut),
        pax,
        paxRules: housePaxRules(h),
        details: { bedrooms: h.bedrooms, bathrooms: h.bathrooms, nights, maxGuests: h.maxGuests },
        quoteRef: quoteRef(cfg.code.slice(0, 3), { h: h.id, ci: req.checkIn, co: req.checkOut, pax }),
      };
    },
    async book() {
      return { bookingRef: bookingRef("CS"), status: "CONFIRMED", payload: { mock: true } };
    },
  };
}
