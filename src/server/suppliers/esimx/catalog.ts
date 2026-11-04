/**
 * Catálogo de eSIM da eSIMX em português, sem chamar a API (funções puras, testadas):
 *  - o que dá para vender pela loja (sem verificação de identidade, validade contando da ativação);
 *  - o melhor pacote de cada combinação (franquia × dias × diário) entre as "séries" do fornecedor;
 *  - nomes de países e regiões em português, cidades conhecidas → país ("Paris" → França);
 *  - textos do card (franquia, validade, cobertura) sem o nome interno do pacote.
 *
 * A cobertura real de cada pacote é a lista `coverages` (a observação em chinês do fornecedor, ex.
 * "não inclui França", já está refletida nela), por isso a busca por país usa só essa lista.
 */

export type EsimxCoverage = { code: string; network?: string; operators?: { operator?: string; networks?: string[] }[] };

export type EsimxPackage = {
  id?: number;
  code: string;
  name: string;
  data: number;
  validity: number;
  amount: number;
  currency?: string;
  is_daily?: boolean;
  topup?: boolean;
  tethering?: boolean;
  ekyc?: boolean;
  monitor?: boolean;
  throttle_speed?: string;
  activation_type?: string;
  billing_type?: string;
  sim_type?: string;
  internet_breakouts?: string;
  operator_command_desc?: string;
  additional_desc?: string;
  activation_desc?: string;
  coverages?: EsimxCoverage[];
};

export type EsimxArea = { code: string; name: string; type: "COUNTRY" | "REGION" | string };

/** Pacote enxuto (o que a loja usa e o que vai para o cache). */
export type Plan = {
  code: string;
  name: string;
  dataMb: number;
  days: number;
  cents: number;
  daily: boolean;
  topup: boolean;
  tethering: boolean;
  ekyc: boolean;
  throttle: string | null;
  billing: string;
  sim: string;
  calls: boolean;
  countries: { code: string; network: string; operators: string[] }[];
};

export function slimPackage(p: EsimxPackage): Plan {
  return {
    code: p.code,
    name: p.name,
    dataMb: Number(p.data) || 0,
    days: Number(p.validity) || 0,
    cents: Number(p.amount) || 0,
    daily: !!p.is_daily,
    topup: !!p.topup,
    tethering: !!p.tethering,
    ekyc: !!p.ekyc,
    throttle: p.throttle_speed?.trim() || null,
    billing: p.billing_type ?? "ONLINE",
    sim: p.sim_type ?? "DATA_ONLY",
    calls: p.sim_type === "NORMAL" || p.sim_type === "PHONE" || /with calls/i.test(p.name),
    countries: (p.coverages ?? [])
      .filter((c) => /^[A-Z]{2}$/.test(c.code ?? ""))
      .map((c) => ({ code: c.code, network: c.network ?? "AUTO", operators: [...new Set((c.operators ?? []).map((o) => o.operator?.trim()).filter((x): x is string => !!x))] })),
  };
}

/**
 * Vendável pela loja: sem verificação de identidade (eKYC), validade que começa na ativação (não na
 * compra) e sem chip de telefonia com promoção (texto só em chinês).
 */
export function sellablePlan(p: Plan): boolean {
  return !p.ekyc && p.billing !== "ORDER" && p.sim !== "PHONE" && p.cents > 0 && p.dataMb > 0 && p.days > 0 && p.countries.length > 0;
}

const networkRank = (n: string | undefined) => (n === "5G" ? 2 : n === "4G" ? 1 : 0);
export const planNetwork = (p: Plan, focus?: string | null): string => {
  const c = focus ? p.countries.find((x) => x.code === focus) : null;
  if (c) return c.network;
  return p.countries.some((x) => x.network === "5G") ? "5G" : p.countries.some((x) => x.network === "4G") ? "4G" : "4G";
};

/**
 * Um pacote por combinação (diário × franquia × dias): o mais barato; empate → melhor rede no país
 * buscado, depois mais países. Ordem: franquia total (dias, depois dados), depois os diários.
 */
export function curatePlans(plans: Plan[], focus?: string | null): Plan[] {
  const best = new Map<string, Plan>();
  for (const p of plans.filter(sellablePlan)) {
    const k = `${p.daily ? 1 : 0}:${p.dataMb}:${p.days}`;
    const cur = best.get(k);
    if (
      !cur ||
      p.cents < cur.cents ||
      (p.cents === cur.cents && (networkRank(planNetwork(p, focus)) > networkRank(planNetwork(cur, focus)) || (networkRank(planNetwork(p, focus)) === networkRank(planNetwork(cur, focus)) && p.countries.length > cur.countries.length)))
    )
      best.set(k, p);
  }
  return [...best.values()].sort((a, b) => Number(a.daily) - Number(b.daily) || a.days - b.days || a.dataMb - b.dataMb || a.cents - b.cents);
}

// ───────────────────────── nomes em português ─────────────────────────

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const COUNTRY_NAME_OVERRIDE: Record<string, string> = {
  CZ: "República Tcheca",
  NL: "Holanda",
  HK: "Hong Kong",
  MO: "Macau",
  AE: "Emirados Árabes",
  US: "Estados Unidos",
  GB: "Reino Unido",
  KR: "Coreia do Sul",
  VN: "Vietnã",
  AX: "Ilhas Åland",
};

let displayNames: Intl.DisplayNames | null | undefined;
export function countryName(code: string): string {
  if (COUNTRY_NAME_OVERRIDE[code]) return COUNTRY_NAME_OVERRIDE[code];
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(["pt-BR"], { type: "region" });
    } catch {
      displayNames = null;
    }
  }
  let n: string | undefined;
  try {
    n = /^[A-Z]{2}$/.test(code) ? displayNames?.of(code) : undefined;
  } catch {
    n = undefined;
  }
  return n && n !== code ? n.replace(/, RAE da China$/, "") : code;
}

export const REGION_NAME: Record<string, string> = {
  europe: "Europa",
  asia: "Ásia",
  "north-america": "América do Norte",
  caribbean: "Caribe",
  "middle-east": "Oriente Médio",
  oceania: "Oceania",
  "south-america": "América do Sul",
  "southeast-asia": "Sudeste Asiático",
  "latin-america": "América Latina",
  africa: "África",
  "central-asia": "Ásia Central",
  "central-america": "América Central",
  "south-asia": "Sul da Ásia",
  "east-asia": "Leste Asiático",
  scandinavia: "Escandinávia",
  nordic: "Países Nórdicos",
  baltic: "Países Bálticos",
  global: "Global",
};

const REGION_ALIAS: Record<string, string> = {
  europa: "europe",
  "uniao europeia": "europe",
  asia: "asia",
  "sudeste asiatico": "southeast-asia",
  "sudeste da asia": "southeast-asia",
  "oriente medio": "middle-east",
  "golfo persico": "middle-east",
  "america do norte": "north-america",
  "america do sul": "south-america",
  "america latina": "latin-america",
  "america central": "central-america",
  caribe: "caribbean",
  africa: "africa",
  oceania: "oceania",
  escandinavia: "scandinavia",
  nordicos: "nordic",
  "paises nordicos": "nordic",
  balticos: "baltic",
  "paises balticos": "baltic",
  "asia central": "central-asia",
  "sul da asia": "south-asia",
  "leste asiatico": "east-asia",
  global: "global",
  mundo: "global",
  mundial: "global",
  internacional: "global",
  "varios paises": "global",
};

const COUNTRY_ALIAS: Record<string, string> = {
  eua: "US",
  usa: "US",
  "estados unidos da america": "US",
  inglaterra: "GB",
  escocia: "GB",
  "gra bretanha": "GB",
  uk: "GB",
  holanda: "NL",
  "paises baixos": "NL",
  tchequia: "CZ",
  "republica tcheca": "CZ",
  coreia: "KR",
  emirados: "AE",
  "emirados arabes": "AE",
  russia: "RU",
  vietna: "VN",
  vietname: "VN",
  turquia: "TR",
};

/** Cidades que os clientes digitam (e os destinos de hotel/ingresso do carrinho) → país. */
const CITY_COUNTRY: Record<string, string> = {
  paris: "FR",
  nice: "FR",
  lyon: "FR",
  roma: "IT",
  rome: "IT",
  milao: "IT",
  milan: "IT",
  florenca: "IT",
  veneza: "IT",
  napoles: "IT",
  lisboa: "PT",
  porto: "PT",
  madri: "ES",
  madrid: "ES",
  barcelona: "ES",
  sevilha: "ES",
  londres: "GB",
  london: "GB",
  edimburgo: "GB",
  dublin: "IE",
  amsterda: "NL",
  amsterdam: "NL",
  berlim: "DE",
  munique: "DE",
  frankfurt: "DE",
  viena: "AT",
  praga: "CZ",
  budapeste: "HU",
  atenas: "GR",
  zurique: "CH",
  genebra: "CH",
  bruxelas: "BE",
  istambul: "TR",
  dubai: "AE",
  "abu dhabi": "AE",
  doha: "QA",
  cairo: "EG",
  orlando: "US",
  kissimmee: "US",
  miami: "US",
  "nova york": "US",
  "new york": "US",
  "los angeles": "US",
  "las vegas": "US",
  "san francisco": "US",
  chicago: "US",
  boston: "US",
  washington: "US",
  toronto: "CA",
  vancouver: "CA",
  montreal: "CA",
  cancun: "MX",
  "cidade do mexico": "MX",
  toquio: "JP",
  tokyo: "JP",
  osaka: "JP",
  kyoto: "JP",
  seul: "KR",
  bangkok: "TH",
  phuket: "TH",
  bali: "ID",
  jacarta: "ID",
  singapura: "SG",
  "hong kong": "HK",
  macau: "MO",
  pequim: "CN",
  xangai: "CN",
  sydney: "AU",
  melbourne: "AU",
  "buenos aires": "AR",
  santiago: "CL",
  lima: "PE",
  bogota: "CO",
  cartagena: "CO",
  "punta cana": "DO",
};

export type ResolvedArea = { code: string; name: string; type: "COUNTRY" | "REGION" };

/** Texto da busca (país, região ou cidade, em português ou inglês) → área da eSIMX. */
export function resolveArea(text: string | null | undefined, areas: EsimxArea[]): ResolvedArea | null {
  const raw = (text ?? "").split(",")[0];
  const q = fold(raw);
  if (!q) return null;
  const country = (code: string): ResolvedArea | null => (areas.some((a) => a.code === code) || !areas.length ? { code, name: countryName(code), type: "COUNTRY" } : null);
  const region = (code: string): ResolvedArea | null => (areas.some((a) => a.code === code) || !areas.length ? { code, name: REGION_NAME[code] ?? code, type: "REGION" } : null);
  if (REGION_ALIAS[q]) return region(REGION_ALIAS[q]);
  if (COUNTRY_ALIAS[q]) return country(COUNTRY_ALIAS[q]);
  if (CITY_COUNTRY[q]) return country(CITY_COUNTRY[q]);
  const named = areas.map((a) => ({ a, pt: fold(a.type === "REGION" ? (REGION_NAME[a.code] ?? a.name) : countryName(a.code)), en: fold(a.name) }));
  const exact = named.find((n) => n.pt === q || n.en === q || n.a.code.toLowerCase() === q);
  const hit = exact ?? (q.length >= 4 ? named.find((n) => n.pt.startsWith(q) || n.en.startsWith(q)) : undefined);
  if (!hit) return null;
  return hit.a.type === "REGION" ? { code: hit.a.code, name: REGION_NAME[hit.a.code] ?? hit.a.name, type: "REGION" } : { code: hit.a.code, name: countryName(hit.a.code), type: "COUNTRY" };
}

// ───────────────────────── textos ─────────────────────────

export function dataLabel(p: Pick<Plan, "dataMb" | "daily">): string {
  const mb = p.dataMb;
  const v = mb >= 1024 ? `${Number.isInteger(mb / 1024) ? mb / 1024 : (mb / 1024).toFixed(1).replace(".", ",")} GB` : `${mb} MB`;
  return p.daily ? `${v} por dia` : v;
}

export const daysLabel = (n: number) => `${n} dia${n === 1 ? "" : "s"}`;

/** Região do pacote para o título quando a busca não diz (ex.: item do carrinho). */
export function planArea(p: Plan): string {
  if (p.countries.length === 1) return countryName(p.countries[0].code);
  const n = p.name.toLowerCase();
  if (n.startsWith("europe")) return "Europa";
  if (n.startsWith("south east asia")) return "Sudeste Asiático";
  if (n.startsWith("gulf")) return "Golfo Pérsico";
  if (n.startsWith("multi area")) return "Multidestino";
  if (p.countries.length <= 3) {
    const names = p.countries.map((c) => countryName(c.code));
    return names.length === 2 ? names.join(" e ") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  }
  return `${p.countries.length} países`;
}

/** Cobertura em uma linha: "Itália", "Itália + 38 países" ou "39 países". */
export function coverageLabel(p: Plan, focus?: string | null): string {
  const n = p.countries.length;
  if (n === 1) return countryName(p.countries[0].code);
  if (focus && p.countries.some((c) => c.code === focus)) return `${countryName(focus)} + ${n - 1} ${n - 1 === 1 ? "país" : "países"}`;
  return `${n} países`;
}

/** Nomes dos países cobertos, em ordem alfabética. */
export const coverageNames = (p: Plan) => p.countries.map((c) => countryName(c.code)).sort((a, b) => a.localeCompare(b, "pt-BR"));

/** "Velocidade reduzida para 128 kbps depois da franquia" (o fornecedor manda "128kbps"). */
export function throttleNote(p: Plan): string | null {
  if (!p.throttle) return null;
  const s = p.throttle.replace(/\s+/g, "").replace(/(\d)(kbps|mbps)/i, (_, d, u) => `${d} ${u.toLowerCase() === "mbps" ? "Mbps" : "kbps"}`);
  return p.daily ? `Depois da franquia do dia: ${s} até o dia seguinte` : `Depois da franquia: ${s}`;
}

/** Destinos populares para a página sem busca e para as sugestões antes do catálogo carregar. */
export const POPULAR_AREAS: ResolvedArea[] = [
  { code: "US", name: "Estados Unidos", type: "COUNTRY" },
  { code: "europe", name: "Europa", type: "REGION" },
  { code: "IT", name: "Itália", type: "COUNTRY" },
  { code: "FR", name: "França", type: "COUNTRY" },
  { code: "PT", name: "Portugal", type: "COUNTRY" },
  { code: "ES", name: "Espanha", type: "COUNTRY" },
  { code: "GB", name: "Reino Unido", type: "COUNTRY" },
  { code: "JP", name: "Japão", type: "COUNTRY" },
  { code: "CA", name: "Canadá", type: "COUNTRY" },
  { code: "AE", name: "Emirados Árabes", type: "COUNTRY" },
  { code: "TH", name: "Tailândia", type: "COUNTRY" },
  { code: "KR", name: "Coreia do Sul", type: "COUNTRY" },
];
