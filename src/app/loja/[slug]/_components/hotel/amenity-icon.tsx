/** Ícone para cada comodidade (pelo texto, em português ou inglês); sem par → visto. */
import {
  Accessibility,
  Baby,
  Bath,
  Briefcase,
  Bus,
  Check,
  CircleParking,
  ConciergeBell,
  Coffee,
  CookingPot,
  Dumbbell,
  Gamepad2,
  Lock,
  PawPrint,
  Refrigerator,
  Snowflake,
  Sparkles,
  Sun,
  Tv,
  UtensilsCrossed,
  WashingMachine,
  Waves,
  Wifi,
  Wine,
  type LucideIcon,
} from "lucide-react";

const RULES: [RegExp, LucideIcon][] = [
  [/wi-?fi|internet/i, Wifi],
  [/piscina|pool|parque aqu|water ?park|toboa/i, Waves],
  [/pequeno-almo|caf[eé] da manh|breakfast|caf[eé](?![a-zà-ü])/i, Coffee],
  [/estacionamento|parking|garagem|valet|manobrista/i, CircleParking],
  [/transfer|transporte|shuttle|traslado/i, Bus],
  [/academia|gin[aá]sio|fitness|\bgym/i, Dumbbell],
  [/\bspa(?![a-zà-ü])|sauna|massag|jacuzzi|hidromassagem/i, Sparkles],
  [/restaurante|restaurant|refei|buffet|room service|servi[cç]o de quarto/i, UtensilsCrossed],
  [/\bbar(?![a-zà-ü])|\bbares|lounge/i, Wine],
  [/ar[- ]condicionado|air condition|climatiza/i, Snowflake],
  [/cozinha|kitchen|micro-?ondas|microwave/i, CookingPot],
  [/frigobar|minibar|frigor[ií]fico|geladeira|fridge/i, Refrigerator],
  [/televis|\btv\b|televisor/i, Tv],
  [/banheira|bathtub|banheiro|casa de banho|chuveiro|duche|shower/i, Bath],
  [/cofre|safe/i, Lock],
  [/lavanderia|lavandaria|laundry/i, WashingMachine],
  [/crian[cç]a|kids|infantil|beb[eê]|ber[cç]o|crib|bab[aá](?![a-zà-ü])/i, Baby],
  [/cadeiras? de rodas|wheelchair|acess[ií]ve|accessible|sem escadas|elevador/i, Accessibility],
  [/animais|pet\b|pets/i, PawPrint],
  [/recep[cç][aã]o|rece[cç][aã]o|concierge|24 horas|24h|front desk/i, ConciergeBell],
  [/neg[oó]cios|business|reuni|confer[eê]ncia|eventos/i, Briefcase],
  [/jogos|games|cinema|entretenimento/i, Gamepad2],
  [/praia|beach|terra[cç]o|terrace|jardim|garden/i, Sun],
];

export function amenityIcon(text: string): LucideIcon {
  return RULES.find(([r]) => r.test(text))?.[1] ?? Check;
}

/** As comodidades que mais pesam na escolha, com ícone próprio, sem repetir o mesmo ícone. */
export function topAmenities(all: string[], max = 8): { text: string; Icon: LucideIcon }[] {
  const out: { text: string; Icon: LucideIcon }[] = [];
  const used = new Set<LucideIcon>();
  // dados numéricos ("Número de restaurantes: 1") não são destaque
  const pool = all.filter((t) => !/^(n[úu]mero|dimens[aã]o|quantidade|n\.?º)\b/i.test(t) && !/:\s*\d/.test(t));
  for (const [re, Icon] of RULES) {
    const hit = pool.find((t) => re.test(t) && !/\(pago à parte\)/.test(t)) ?? pool.find((t) => re.test(t));
    if (!hit || used.has(Icon)) continue;
    used.add(Icon);
    out.push({ text: hit, Icon });
    if (out.length >= max) break;
  }
  return out;
}
