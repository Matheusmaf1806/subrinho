/**
 * Conteúdo de hotel organizado por assunto (comum aos fornecedores de hotel).
 *
 * Cada fornecedor manda o conteúdo de um jeito (a GGT num texto único com títulos, a Hotelbeds em
 * listas com códigos); aqui ficam as regras que transformam isso no formato da página do hotel:
 * categorias das fotos, grupos de comodidades, seções da descrição, distâncias e horários.
 */
import type { HotelContent, HotelPhoto } from "../types";

export const EMPTY_HOTEL_CONTENT: HotelContent = {
  photos: [],
  about: [],
  amenities: [],
  roomAmenities: [],
  times: { checkInFrom: null, checkInUntil: null, checkOutUntil: null, minAge: null },
  coordinates: null,
  nearby: [],
  policies: [],
  languages: [],
  issues: [],
  facts: [],
};

// ───────────────────────── Fotos ─────────────────────────

export const PHOTO_TAGS = ["Fachada e arredores", "Quartos", "Piscina", "Lazer", "Restaurantes", "Áreas comuns"] as const;

const PHOTO_RULES: [RegExp, (typeof PHOTO_TAGS)[number]][] = [
  [/pool|piscina|water ?park|hot tub|jacuzzi|whirlpool|lazy river|waterslide/i, "Piscina"],
  [/room|suite|bed|bath|kitchen|living|in-room|guestroom|quarto|banheiro|cozinha|minibar|balcony|varanda|view from/i, "Quartos"],
  [/restaurant|dining|breakfast|buffet|bar\b|food|coffee|caf[eé]|snack|lounge bar|restaurante/i, "Restaurantes"],
  [/spa|sauna|massage|fitness|gym|sport|tennis|golf|game|playground|kids|children|recreation|theater|casino|academia|lazer/i, "Lazer"],
  [/lobby|reception|hall|interior|lounge|business|meeting|banquet|ballroom|conference|laundry|check-in|front desk|recep|eventos/i, "Áreas comuns"],
  [/exterior|primary|front|facade|fachada|grounds|garden|beach|praia|terrace|terra[cç]o|aerial|entrance|parking|view|courtyard|property|area|point of interest|city|land/i, "Fachada e arredores"],
];

/** "Guestroom" → "Quartos"; "Outdoor pool" → "Piscina"; desconhecido → null. */
export function photoTag(description: string | null | undefined): string | null {
  const d = String(description ?? "").trim();
  if (!d) return null;
  return PHOTO_RULES.find(([r]) => r.test(d))?.[1] ?? null;
}

/** Tipos de imagem da Hotelbeds (types/imagetypes). */
const HB_IMAGE_TAG: Record<string, string> = {
  GEN: "Fachada e arredores",
  PLA: "Fachada e arredores",
  TER: "Fachada e arredores",
  HAB: "Quartos",
  PIS: "Piscina",
  DEP: "Lazer",
  RES: "Restaurantes",
  BAR: "Restaurantes",
  COM: "Áreas comuns",
  CON: "Áreas comuns",
};
export const hbImageTag = (code: string | null | undefined) => (code ? (HB_IMAGE_TAG[code.toUpperCase()] ?? null) : null);

// ───────────────────────── Foto de cada quarto ─────────────────────────

/** Palavras que distinguem um tipo de quarto (cama, categoria, vista). */
const ROOM_WORDS = /^(king|queen|double|twin|single|triple|quadruple|suite|junior|family|deluxe|superior|premier|premium|executive|club|grand|studio|loft|penthouse|villa|bungalow|cabana|accessible|lake|pool|ocean|sea|beach|garden|city|mountain|river|park|balcony|terrace|kitchen|kitchenette|bedroom|bunk|sofa)$/;
/** Legenda genérica: não diz qual quarto é. */
const GENERIC_CAPTION = /^(room|rooms|guestroom|guest room|bathroom|private bathroom|in-room amenity|in-room safe|private kitchen|private kitchenette|living area|living room|minibar|view from room|room amenity|primary image)$/i;

const roomTokens = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => ROOM_WORDS.test(w));

/**
 * Fotos cuja legenda cita o tipo de quarto ("Family Room, 2 Queen Beds, Lake View" para o quarto
 * "Family Double Queen"). Precisa de pelo menos uma palavra em comum; fica com as de maior acerto.
 */
export function matchRoomPhotos(roomTitle: string, photos: HotelPhoto[], max = 6): string[] {
  const want = new Set(roomTokens(roomTitle));
  if (!want.size) return [];
  let best = 0;
  const scored = photos
    .filter((p) => p.caption && !GENERIC_CAPTION.test(p.caption.trim()) && (p.tag === "Quartos" || /room|suite|bed/i.test(p.caption)))
    .map((p) => {
      const got = new Set(roomTokens(p.caption!));
      const score = [...want].filter((w) => got.has(w)).length;
      best = Math.max(best, score);
      return { url: p.url, score };
    });
  return best ? scored.filter((s) => s.score === best).slice(0, max).map((s) => s.url) : [];
}

// ───────────────────────── Comodidades ─────────────────────────

// sem \b no fim das palavras: em JS "ç"/"ã" contam como fim de palavra ("espaços" casaria com /spa\b/)
const AMENITY_GROUPS: [string, RegExp][] = [
  ["Lazer e bem-estar", /piscina|pool|\bspa(?![a-zà-ü])|sauna|jacuzzi|hidromassagem|gin[aá]sio|academia|fitness|\bgym|golfe|\bgolf|t[eê]nis|tennis|jogos|games|parque aqu|water ?park|toboa|praia|beach|massag|bicicleta|\bbike|ioga|yoga|cinema|teatro|casino|cassino|entretenimento|lazer|recrea/i],
  ["Alimentação", /restaurante|restaurant|\bbar(?![a-zà-ü])|\bbares|caf[eé](?![a-zà-ü])|pequeno-almo|breakfast|refei|buffet|snack|lanchonete|room service|servi[cç]o de quarto|cozinha comum|churrasqueira|\bbbq|m[aá]quina de venda|vending|minimercado|mercearia/i],
  ["Internet e negócios", /wi-?fi|internet|computador|computer|impressora|printer|neg[oó]cios|business|reuni|meeting|confer[eê]ncia|eventos|coworking/i],
  ["Estacionamento e transporte", /estacionamento|parking|garagem|garage|valet|manobrista|transfer|transporte|shuttle|traslado|aluguel de carro|car rental|carregador|charging|el[eé]tric/i],
  ["Família", /crian[cç]a|\bkids|infantil|beb[eê]|ber[cç]o|\bcot(?![a-zà-ü])|\bcrib|babysit|bab[aá](?![a-zà-ü])|parque infantil|playground|fam[ií]lia|family/i],
  ["Acessibilidade", /cadeiras? de rodas|wheelchair|acess[ií]ve(?:l|is)|accessible|braille|sem escadas|step-free|rampa|elevador|elevator|\blift(?![a-zà-ü])|audi[cç][aã]o|deficien/i],
];
/** Ordem em que um item é testado (o mais específico primeiro: "estacionamento acessível" é transporte). */
const MATCH_ORDER = ["Estacionamento e transporte", "Acessibilidade", "Família", "Internet e negócios", "Alimentação", "Lazer e bem-estar"].map((g) => AMENITY_GROUPS.find(([n]) => n === g)!);

/** Item que não ajuda a decidir (negativos, técnicos, textos longos demais). */
function noisyAmenity(f: string): boolean {
  return f.length > 90 || /^sem\s|^without\b|\bn[aã]o\b|\bnot\b|\bno\b|fumador|fumante|smoking|alarme|alarm|extintor|detetor|detector|barra de apoio|grab bar|tamanho do televisor|tv size|polegadas|inches|sinaliza/i.test(f);
}

/** Lista solta de comodidades → grupos ("Lazer e bem-estar", "Alimentação"…, resto em "Serviços"). */
export function groupAmenities(list: string[], first: Record<string, string[]> = {}): { group: string; items: string[] }[] {
  const groups = new Map<string, string[]>(Object.entries(first).map(([k, v]) => [k, [...v]]));
  const seen = new Set<string>([...groups.values()].flat().map((x) => x.toLowerCase()));
  for (const raw of list) {
    const f = tidyAmenity(raw);
    if (!f || noisyAmenity(f) || seen.has(f.toLowerCase())) continue;
    seen.add(f.toLowerCase());
    const g = MATCH_ORDER.find(([, r]) => r.test(f))?.[0] ?? "Serviços";
    groups.set(g, [...(groups.get(g) ?? []), f]);
  }
  const order = [...AMENITY_GROUPS.map(([g]) => g), "Serviços"];
  return [...groups.entries()]
    .filter(([, items]) => items.length)
    .sort(([a], [b]) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)))
    .map(([group, items]) => ({ group, items }));
}

/** "Estacionamento (sobretaxa)" → "Estacionamento (pago à parte)"; tira pontos e espaços sobrando. */
export function tidyAmenity(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\((?:sobretaxa|surcharge|taxa adicional|com custo)\)/gi, "(pago à parte)")
    .replace(/^[-•·\s]+|[.;,\s]+$/g, "")
    .trim();
}

/** Comodidades do quarto: sem itens técnicos e sem repetição. */
export function roomAmenitiesFrom(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const f = tidyAmenity(raw);
    if (!f || noisyAmenity(f) || /^may include:?$/i.test(f) || seen.has(f.toLowerCase())) continue;
    seen.add(f.toLowerCase());
    out.push(f);
  }
  return out;
}

// ───────────────────────── Distâncias e horários ─────────────────────────

/** 850 → "850 m"; 1900 → "1,9 km"; 25000 → "25 km". */
export function formatMeters(m: number | string | null | undefined): string | null {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1000) return `${Math.round(n / 10) * 10} m`;
  const km = n / 1000;
  return `${km < 10 ? km.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : Math.round(km).toLocaleString("pt-BR")} km`;
}

/** "15:00:00" / "3:00 PM" / "15h" → "15:00"; inválido → null. */
export function hhmm(s: string | null | undefined): string | null {
  const m = String(s ?? "").trim().match(/^(\d{1,2})(?::|h)?(\d{2})?(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "Florida Mall - 1,9 km/1,2 mi" → { name, distance: "1,9 km" }. */
export function parseDistanceLine(line: string): { name: string; distance: string | null } | null {
  const t = line.replace(/\s+/g, " ").trim();
  if (!t || t.length > 140 || /:$/.test(t)) return null;
  const m = t.match(/^(.+?)\s+[-–—]\s+(\d[\d.,]*)\s*(km|m)\b/i);
  if (m) return { name: m[1].trim(), distance: `${m[2]} ${m[3].toLowerCase()}` };
  return null;
}

// ───────────────────────── Descrição em seções (GGT) ─────────────────────────

/** Títulos (já em português, ver HEADINGS da GGT) → para onde vai o trecho. */
const SECTION_KIND: [RegExp, "about" | "nearby" | "languages" | "policy" | "time"][] = [
  [/^(localiza[cç][aã]o|quartos|restaurantes|comodidades|outras comodidades|comodidades para neg[oó]cios|lazer|para a fam[ií]lia|acessibilidade)$/i, "about"],
  [/^atra[cç][oõ]es pr[oó]ximas$/i, "nearby"],
  [/^idiomas falados$/i, "languages"],
  [/^(check-in a partir de|check-in at[eé]|check-out at[eé]|idade m[ií]nima para o check-in)$/i, "time"],
  [/^(antes de ir|taxas obrigat[oó]rias \(pagas no hotel\)|taxas opcionais|taxas|instru[cç][oõ]es de check-in|instru[cç][oõ]es especiais de check-in|animais de estima[cç][aã]o|pol[ií]ticas)$/i, "policy"],
];
const KNOWN_TITLE = /^(Localização|Quartos|Restaurantes|Outras comodidades|Comodidades para negócios|Comodidades|Atrações próximas|Lazer|Para a família|Acessibilidade|Idiomas falados|Antes de ir|Taxas obrigatórias \(pagas no hotel\)|Taxas opcionais|Taxas|Instruções especiais de check-in|Instruções de check-in|Check-in até|Idade mínima para o check-in|Check-in a partir de|Check-out até|Animais de estimação|Políticas):\s*(.*)$/;

/** Como cada seção de políticas aparece na página. */
const POLICY_TITLE: [RegExp, string][] = [
  [/taxas obrigat/i, "Taxas pagas no hotel"],
  [/^taxas/i, "Taxas opcionais"],
  [/instru[cç]/i, "Na chegada"],
  [/antes de ir/i, "Antes de ir"],
  [/animais/i, "Animais de estimação"],
  [/pol[ií]ticas/i, "Políticas do hotel"],
];

/** Frases de rodapé do fornecedor que não dizem nada ao cliente. */
const BOILERPLATE = /lista anterior pode n[aã]o estar completa|inclu[ií]mos todas as taxas|tradu[cç][aã]o autom[aá]tica|tradu[zc]id[ao] (?:recorrendo|com|por)|dist[aâ]ncias s[aã]o apresentadas|the above list may not be comprehensive|we have included all charges/i;

function dropBoilerplate(s: string): string {
  return s
    .split(/(?<=[.!?])\s*(?=[A-ZÀ-Ú])/)
    .filter((x) => x.trim() && !BOILERPLATE.test(x))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export type DescriptionParts = Pick<HotelContent, "about" | "nearby" | "policies" | "languages" | "times">;

/**
 * Descrição da GGT já limpa ("Título: texto", ver cleanDescription) → seções da página.
 * Linhas sem título seguem na seção anterior (listas); antes do 1º título vão para "sobre".
 */
export function splitDescription(text: string): DescriptionParts {
  const about: HotelContent["about"] = [];
  const nearby: HotelContent["nearby"] = [];
  const policies = new Map<string, string[]>();
  const languages: string[] = [];
  const times: HotelContent["times"] = { checkInFrom: null, checkInUntil: null, checkOutUntil: null, minAge: null };
  let kind: "about" | "nearby" | "languages" | "policy" | "time" | null = null;
  let title: string | null = null;
  let airport = false;

  const add = (line: string) => {
    const l = dropBoilerplate(line);
    if (!l) return;
    if (kind === "nearby") {
      if (/aeroporto|airport/i.test(l) && /:$/.test(l)) {
        airport = true;
        return;
      }
      const d = parseDistanceLine(l);
      if (d) nearby.push({ ...d, kind: airport || /aeroporto|airport|\([A-Z]{3}\b/i.test(d.name) ? "airport" : "place" });
      return;
    }
    if (kind === "languages") {
      languages.push(...l.split(/,|\se\s|\sand\s/).map((x) => x.trim().replace(/\.$/, "")).filter(Boolean));
      return;
    }
    if (kind === "time" && title) {
      if (/a partir de/i.test(title)) times.checkInFrom ??= hhmm(l);
      else if (/check-in at/i.test(title)) times.checkInUntil ??= hhmm(l);
      else if (/check-out/i.test(title)) times.checkOutUntil ??= hhmm(l);
      else if (/idade/i.test(title)) times.minAge ??= Number(l.match(/\d+/)?.[0]) || null;
      return;
    }
    if (kind === "policy" && title) {
      const t = POLICY_TITLE.find(([r]) => r.test(title!))?.[1] ?? title;
      policies.set(t, [...(policies.get(t) ?? []), l]);
      return;
    }
    // sobre o hotel: junta as linhas da mesma seção num parágrafo
    const last = about[about.length - 1];
    if (last && last.title === (kind === "about" ? title : null) && kind !== null) last.text = `${last.text} ${l}`;
    else about.push({ title: kind === "about" ? title : null, text: l });
  };

  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(KNOWN_TITLE);
    if (m) {
      title = m[1];
      kind = SECTION_KIND.find(([r]) => r.test(title!))?.[1] ?? "about";
      airport = false;
      if (m[2]) add(m[2]);
      continue;
    }
    add(line);
  }
  return { about, nearby, policies: [...policies.entries()].map(([t, items]) => ({ title: t, items: joinSublists(items) })), languages: [...new Set(languages)], times };
}

/** "A taxa inclui:" + itens curtos seguidos → uma linha só ("A taxa inclui: Academia, Cofre, Piscina"). */
function joinSublists(items: string[]): string[] {
  const out: string[] = [];
  let open = false;
  for (const it of items) {
    if (open && it.length <= 60 && !/[.:]$/.test(it)) {
      const prev = out[out.length - 1];
      out[out.length - 1] = prev.endsWith(":") ? `${prev} ${it}` : `${prev}, ${it}`;
      continue;
    }
    out.push(it);
    // abre lista: "Inclui:" sozinho, ou "A taxa inclui: primeiro item" (o resto vem nas linhas seguintes)
    const m = it.match(/^(.{3,60}):\s*(.{0,60})$/);
    open = !!m && !/\.$/.test(it) && (m[2] === "" || /inclu/i.test(m[1]));
  }
  return out;
}

/** Avisos com data que pegam a estadia (sem data = sempre). */
export function issuesDuring<T extends { from: string | null; to: string | null }>(list: T[], checkIn: string, checkOut: string): T[] {
  return list.filter((i) => (!i.to || i.to >= checkIn) && (!i.from || i.from <= checkOut));
}
