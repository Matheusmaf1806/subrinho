/**
 * Utilidades das casas de temporada (comuns aos fornecedores de casas): nomes das comodidades em
 * português, tipo de imóvel, região de Orlando e busca por destino.
 */
import type { PaxConfig } from "@/server/db/schema";
import { addDays, todayLocal } from "@/lib/tz";
import type { PaxRule } from "../types";
import { brDate, normalizeText, titleCase } from "../hotels/common";

// ───────────── Hóspedes e política (comuns a todas as casas) ─────────────

/** Adultos + crianças (as duas idades contam na capacidade da casa). */
export const houseGuests = (pax: Partial<PaxConfig>) => Math.max(1, Number(pax.adults ?? 0)) + Math.max(0, Number(pax.children ?? 0));

export function normalizeHousePax(pax: Partial<PaxConfig> | undefined): PaxConfig {
  return { adults: Math.max(1, Math.floor(Number(pax?.adults ?? 2)) || 1), children: Math.max(0, Math.floor(Number(pax?.children ?? 0)) || 0) };
}

export const housePaxRules = (max: number): PaxRule[] => [
  { type: "ADULT", label: "Adultos", min: 1, max: Math.max(1, max), hint: `A casa acomoda até ${max} hóspedes` },
  { type: "CHILD", label: "Crianças", min: 0, max: Math.max(0, max - 1), hint: "Crianças contam na capacidade da casa" },
];

/**
 * Política de cancelamento quando a API do fornecedor não informa: vale a regra configurada
 * (cancelamento grátis até N dias antes do check-in); sem ela, "Não reembolsável".
 */
export function cancellationFor(checkIn: string, freeCancelDays: number | null): { until: string | null; text: string } {
  if (freeCancelDays && freeCancelDays > 0) {
    const until = addDays(checkIn, -freeCancelDays);
    if (until > todayLocal()) return { until, text: `Cancelamento grátis até ${brDate(until)}` };
  }
  return { until: null, text: "Não reembolsável" };
}

/** Comodidades (códigos MAPRO/OTA, sem o prefixo "amenity_") → português. */
export const AMENITY_PT: Record<string, string> = {
  air_conditioning: "Ar-condicionado",
  air_hockey_table: "Mesa de air hockey",
  baby_bath: "Banheira de bebê",
  baby_listening_device: "Babá eletrônica",
  baby_safety_gates: "Portão de segurança para bebês",
  balcony: "Varanda",
  bathtub: "Banheira",
  bath_toiletries: "Sabonete e xampu",
  bbq_grill: "Churrasqueira",
  beach: "Praia",
  beach_towels: "Itens de praia",
  bedding_essentials: "Roupa de cama e banho",
  bed_linen: "Roupa de cama",
  billiards_pool_tables: "Mesa de sinuca",
  blender: "Liquidificador",
  board_games_puzzles: "Jogos de tabuleiro",
  boat_slip: "Vaga para barco",
  bowling: "Boliche",
  carbon_monoxide_detector: "Detector de monóxido de carbono",
  ceiling_fan: "Ventilador de teto",
  changing_table: "Trocador",
  childrens_books_and_toys: "Livros e brinquedos infantis",
  childrens_dinnerware: "Louça infantil",
  cleaning_products: "Produtos de limpeza",
  coffee: "Café",
  coffee_maker: "Cafeteira",
  communal_pool: "Piscina do condomínio",
  cooking_basics: "Itens básicos de cozinha",
  cribs_available: "Berço",
  dining_table: "Mesa de jantar",
  dishwasher: "Lava-louças",
  dryer: "Secadora",
  dvd_player: "DVD",
  electric_kettle: "Chaleira elétrica",
  electric_vehicle_charger: "Carregador de carro elétrico",
  elevator: "Elevador",
  exercise_equipment: "Equipamentos de ginástica",
  extra_pillows_and_blankets: "Travesseiros e cobertores extras",
  fan: "Ventiladores",
  firepit: "Fogueira externa",
  fireplace: "Lareira",
  fire_extinguisher: "Extintor de incêndio",
  first_aid_kit: "Kit de primeiros socorros",
  fishing: "Pesca",
  freezer: "Freezer",
  free_bike: "Bicicletas",
  free_cable_internet: "Internet a cabo",
  free_parking: "Estacionamento grátis",
  free_parking_on_the_street: "Estacionamento grátis na rua",
  game_room: "Sala de jogos",
  garden_or_backyard: "Quintal",
  golf: "Golfe",
  gym: "Academia",
  hair_dryer: "Secador de cabelo",
  hammock: "Rede",
  hanger: "Cabides",
  heated_pool: "Piscina aquecida",
  heated_private_pool: "Piscina privativa aquecível",
  heating: "Aquecimento",
  high_chairs: "Cadeirão de bebê",
  hot_tub: "Hidromassagem (spa)",
  hot_tub_common: "Hidromassagem do condomínio",
  hot_water: "Água quente",
  in_room_movies: "Sala de cinema",
  iron: "Ferro de passar",
  jacuzzi: "Jacuzzi",
  kayak_onsite: "Caiaque",
  kids_outdoor_play_equipment: "Playground",
  kitchen: "Cozinha completa",
  kitchenette: "Cozinha compacta",
  kitchen_supplies: "Louças e talheres",
  lake_view: "Vista para o lago",
  laptop_workspace: "Espaço de trabalho",
  laundry_private: "Lavanderia privativa",
  long_term_stays: "Aceita estadias longas",
  microwave: "Micro-ondas",
  miniature_golf: "Minigolfe",
  mini_refrigerator: "Frigobar",
  no_pets_allowed: "Não aceita animais",
  outdoor_dining_area: "Área de refeições externa",
  outdoor_furniture: "Móveis externos",
  outdoor_kitchen: "Cozinha externa",
  outdoor_parking: "Estacionamento externo",
  outdoor_tennis: "Quadra de tênis",
  oven: "Forno",
  patio: "Pátio",
  pets_are_welcome: "Aceita animais",
  piano: "Piano",
  ping_pong_table: "Mesa de pingue-pongue",
  pool_safety_fence: "Cerca de proteção na piscina",
  private_entrance: "Entrada privativa",
  private_pool: "Piscina privativa",
  refrigerator: "Geladeira",
  resort_access: "Acesso ao clube do condomínio",
  room_darkening_shades: "Cortinas blackout",
  room_decor: "Quarto temático",
  safe: "Cofre",
  sauna: "Sauna",
  single_level_home: "Casa térrea",
  smoke_detectors: "Detector de fumaça",
  sound_system: "Sistema de som",
  south_facing_pool: "Piscina voltada para o sul",
  spa: "Spa",
  stove: "Fogão",
  stroller: "Carrinho de bebê",
  sun_loungers: "Espreguiçadeiras",
  swimming_pool: "Piscina",
  toaster: "Torradeira",
  travel_crib: "Berço portátil",
  tv: "TV",
  video_game_system: "Videogame",
  video_game_system_w_games: "Videogame com jogos",
  walk_in_closet: "Closet",
  washer: "Lavadora",
  washer_dryer: "Lavadora e secadora",
  waterfront: "Beira d'água",
  wheelchair_access_possible: "Acessível para cadeira de rodas",
  wireless_internet: "Wi-Fi",
};

/** Ordem de destaque (o que mais pesa na escolha de uma casa em Orlando). */
const AMENITY_RANK = [
  "private_pool",
  "heated_private_pool",
  "heated_pool",
  "hot_tub",
  "jacuzzi",
  "game_room",
  "in_room_movies",
  "room_decor",
  "video_game_system_w_games",
  "video_game_system",
  "billiards_pool_tables",
  "resort_access",
  "communal_pool",
  "gym",
  "wireless_internet",
  "air_conditioning",
  "washer_dryer",
  "laundry_private",
  "kitchen",
  "bbq_grill",
  "free_parking",
  "cribs_available",
  "pets_are_welcome",
];

const amenityKey = (id: string) => id.replace(/^amenity_/, "");

export function amenityLabel(id: string, fallback?: string): string | null {
  const pt = AMENITY_PT[amenityKey(id)];
  if (pt) return pt;
  return fallback ? fallback : null;
}

/** Comodidades em português, as mais importantes primeiro (desconhecidas ficam de fora). */
export function rankAmenities(ids: string[]): string[] {
  const keys = [...new Set(ids.map(amenityKey))];
  const score = (k: string) => {
    const i = AMENITY_RANK.indexOf(k);
    return i < 0 ? 1000 : i;
  };
  return keys
    .sort((a, b) => score(a) - score(b))
    .map((k) => AMENITY_PT[k])
    .filter((x): x is string => !!x);
}

export function hasAmenity(ids: string[], ...wanted: string[]): boolean {
  const keys = new Set(ids.map(amenityKey));
  return wanted.some((w) => keys.has(w));
}

export function propertyTypeLabel(t: string | null | undefined): string {
  const k = normalizeText(t ?? "");
  if (!k) return "Casa";
  if (k.includes("townhouse") || k.includes("town home") || k.includes("townhome")) return "Townhouse";
  if (k.includes("condo") || k.includes("apartment")) return "Apartamento";
  if (k.includes("villa")) return "Villa";
  if (k.includes("resort")) return "Casa em resort";
  return "Casa";
}

/** Pés quadrados → m² (arredondado). */
export function sqftToM2(sqft: unknown): number | null {
  const n = Number(sqft);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 0.092903) : null;
}

/** Banheiros: 5.5 → "5½". */
export function bathroomsText(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  const whole = Math.floor(v);
  return v - whole >= 0.5 ? `${whole}½` : String(whole);
}

// ───────────── Região de Orlando ─────────────

/** Centro de referência: Walt Disney World. */
const DISNEY = { lat: 28.3852, lon: -81.5639 };
const ORLANDO_RADIUS_KM = 60;

/** Termos que significam "Orlando e arredores" (as casas ficam em Kissimmee, Davenport etc.). */
const ORLANDO_TERMS = [
  "orlando",
  "disney",
  "disney world",
  "walt disney world",
  "universal",
  "kissimmee",
  "lake buena vista",
  "celebration",
  "davenport",
  "championsgate",
  "champions gate",
  "four corners",
  "clermont",
  "windermere",
  "reunion",
  "haines city",
  "poinciana",
  "winter garden",
  "central florida",
];

const ORLANDO_CITIES = new Set(ORLANDO_TERMS.filter((t) => !["disney", "disney world", "walt disney world", "universal", "central florida"].includes(t)));

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type HousePlace = {
  city?: string | null;
  state?: string | null;
  region?: string | null;
  resort?: string | null;
  title?: string | null;
  alias?: string | null;
  address?: string | null;
  lat?: number | null;
  lon?: number | null;
};

function inOrlandoArea(p: HousePlace): boolean {
  if (p.city && ORLANDO_CITIES.has(normalizeText(p.city))) return true;
  if (typeof p.lat === "number" && typeof p.lon === "number" && (p.lat !== 0 || p.lon !== 0)) return distanceKm(DISNEY, { lat: p.lat, lon: p.lon }) <= ORLANDO_RADIUS_KM;
  return /orlando|kissimmee|davenport/.test(normalizeText(`${p.region ?? ""} ${p.address ?? ""}`));
}

/** A casa atende ao destino digitado? (vazio = todas). "Orlando" inclui Kissimmee, Davenport… */
export function matchesHouseDestination(query: string | null | undefined, p: HousePlace): boolean {
  const q = normalizeText((query ?? "").split(",")[0]);
  if (!q) return true;
  if (ORLANDO_TERMS.some((t) => q === t || q.startsWith(`${t} `) || (q.length >= 4 && t.startsWith(q)))) return inOrlandoArea(p);
  if (["florida", "fl"].includes(q)) return /^(fl|florida)$/.test(normalizeText(p.state ?? ""));
  const hay = normalizeText([p.city, p.state, p.region, p.resort, p.title, p.alias, p.address].filter(Boolean).join(" "));
  return hay.includes(q);
}

/** Cidade para exibir ("KISSIMMEE" → "Kissimmee"). */
export function cityLabel(city: string | null | undefined): string {
  const c = (city ?? "").trim();
  return c ? titleCase(c) : "";
}

/** Horário "16:00:00" → "16h" / "10:30:00" → "10h30". */
export function hourText(t: string | null | undefined): string | null {
  const m = (t ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return m[2] === "00" ? `${h}h` : `${h}h${m[2]}`;
}
