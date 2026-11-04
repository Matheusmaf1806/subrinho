/**
 * Seções da página do hotel (servidor): visão geral, comodidades, localização e políticas.
 * Tudo a partir do conteúdo do fornecedor já organizado (HotelContent); seção sem dados não aparece.
 */
import type { ReactNode } from "react";
import {
  Accessibility,
  Baby,
  BedDouble,
  CircleParking,
  Clock,
  ConciergeBell,
  ExternalLink,
  Info,
  Languages,
  LogIn,
  LogOut,
  MapPin,
  Plane,
  TriangleAlert,
  UtensilsCrossed,
  Waves,
  Wifi,
  IdCard,
  type LucideIcon,
} from "lucide-react";
import type { HotelContent } from "@/server/suppliers/types";
import { date } from "@/lib/format";
import { amenityIcon, topAmenities } from "./amenity-icon";

const GROUP_ICON: Record<string, LucideIcon> = {
  "Lazer e bem-estar": Waves,
  Alimentação: UtensilsCrossed,
  "Internet e negócios": Wifi,
  "Estacionamento e transporte": CircleParking,
  Família: Baby,
  Acessibilidade: Accessibility,
  Serviços: ConciergeBell,
  "Nos quartos": BedDouble,
};

export function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-ink">{eyebrow}</p>}
        <h2 className="text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-none tracking-[-0.045em] text-ink">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ───────────────────────── Visão geral ─────────────────────────

export function HotelOverview({ h, allAmenities }: { h: HotelContent; allAmenities: string[] }) {
  const titled = h.about.filter((a) => a.title);
  const lead = titled.length ? titled.filter((a) => /localiza|quartos/i.test(a.title!)) : h.about.slice(0, 2);
  const rest = h.about.filter((a) => !lead.includes(a));
  const top = topAmenities(allAmenities, 8);
  return (
    <div className="min-w-0 space-y-8">
      <div className="space-y-5">
        {lead.map((a, i) => (
          <div key={i}>
            {a.title && <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">{a.title}</p>}
            <p className={i === 0 ? "text-[18px] leading-relaxed text-ink" : "text-[16px] leading-relaxed text-ink/80"}>{a.text}</p>
          </div>
        ))}
        {rest.length > 0 && (
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-[14px] font-semibold text-ink hover:bg-surface-2">
              <span className="group-open:hidden">Mais sobre o hotel</span>
              <span className="hidden group-open:inline">Mostrar menos</span>
            </summary>
            <div className="mt-4 space-y-4">
              {rest.map((a, i) => (
                <div key={i}>
                  {a.title && <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">{a.title}</p>}
                  <p className="text-[15px] leading-relaxed text-ink/80">{a.text}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      {top.length > 0 && (
        <div>
          <p className="mb-3 text-[15px] font-semibold text-ink">Destaques do hotel</p>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {top.map(({ text, Icon }) => (
              <li key={text} className="flex items-center gap-3 text-[15px] text-ink">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-accent-ink">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
          {allAmenities.length > top.length && (
            <a href="#comodidades" className="mt-4 inline-flex text-[14px] font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
              Ver todas as {allAmenities.length} comodidades
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Cartão lateral: datas, horários, idade mínima, números do hotel e idiomas. */
export function StayCard({ h, checkIn, checkOut, nights, pax, footer }: { h: HotelContent; checkIn: string; checkOut: string; nights: number; pax: string; footer?: ReactNode }) {
  const t = h.times;
  const rows: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: LogIn, label: "Check-in", value: `${date(checkIn)}${t.checkInFrom ? ` · a partir das ${t.checkInFrom}` : ""}${t.checkInUntil ? ` (até ${t.checkInUntil})` : ""}` },
    { icon: LogOut, label: "Check-out", value: `${date(checkOut)}${t.checkOutUntil ? ` · até ${t.checkOutUntil}` : ""}` },
    ...(t.minAge ? [{ icon: IdCard, label: "Idade mínima no check-in", value: `${t.minAge} anos` }] : []),
    ...h.facts.slice(0, 3).map((f) => ({ icon: Info, label: f.label, value: f.value })),
    ...(h.languages.length ? [{ icon: Languages, label: "Idiomas na recepção", value: h.languages.join(", ") }] : []),
  ];
  return (
    <aside className="rounded-[1.75rem] bg-white p-6 ring-1 ring-inset ring-black/[0.07] shadow-[0_30px_80px_-50px_rgba(10,10,11,0.45)] lg:sticky lg:top-[136px]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Sua estadia</p>
      <p className="mt-1 text-xl font-semibold tracking-[-0.03em] text-ink">
        {nights} noite{nights > 1 ? "s" : ""} · {pax}
      </p>
      <dl className="mt-5 space-y-3.5">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3">
            <r.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
            <div className="min-w-0">
              <dt className="text-[12px] text-muted">{r.label}</dt>
              <dd className="text-[15px] font-semibold text-ink">{r.value}</dd>
            </div>
          </div>
        ))}
      </dl>
      {footer && <div className="mt-6 border-t border-line pt-5">{footer}</div>}
    </aside>
  );
}

/** Avisos do hotel que pegam a estadia (obras, piscina fechada…). */
export function HotelIssues({ h }: { h: HotelContent }) {
  if (!h.issues.length) return null;
  return (
    <div className="rounded-[1.5rem] bg-amber-50 p-5 ring-1 ring-inset ring-amber-200 sm:p-6">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-amber-900">
        <TriangleAlert className="h-5 w-5" aria-hidden /> Avisos do hotel para as suas datas
      </p>
      <ul className="mt-3 space-y-2">
        {h.issues.map((i) => (
          <li key={i.text} className="text-[14px] leading-relaxed text-amber-950/85">
            {i.text}
            {(i.from || i.to) && (
              <span className="ml-1 text-amber-900/60">
                ({i.from ? `de ${date(i.from)}` : ""}
                {i.to ? ` até ${date(i.to)}` : ""})
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── Comodidades ─────────────────────────

export function HotelAmenities({ h }: { h: HotelContent }) {
  const groups = [...h.amenities, ...(h.roomAmenities.length ? [{ group: "Nos quartos", items: h.roomAmenities }] : [])];
  if (!groups.length) return null;
  return (
    <section id="comodidades" className="scroll-mt-36">
      <SectionHeading eyebrow="Comodidades" title="O que o hotel oferece" />
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
        {groups.map((g) => {
          const Icon = GROUP_ICON[g.group] ?? ConciergeBell;
          return (
            <div key={g.group} className="break-inside-avoid rounded-[1.5rem] bg-surface p-5">
              <p className="flex items-center gap-2.5 text-[16px] font-semibold text-ink">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-accent-ink">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                {g.group}
              </p>
              {g.group === "Nos quartos" && <p className="mt-2 text-[12px] text-muted">Pode variar conforme o tipo de quarto.</p>}
              <ul className="mt-3 space-y-2">
                {g.items.map((it) => {
                  const I = amenityIcon(it);
                  return (
                    <li key={it} className="flex items-start gap-2.5 text-[14px] leading-snug text-ink/85">
                      <I className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /> {it}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ───────────────────────── Localização ─────────────────────────

export function HotelLocation({ h, address, title }: { h: HotelContent; address: string; title: string }) {
  const places = h.nearby.filter((n) => n.kind === "place");
  const airports = h.nearby.filter((n) => n.kind === "airport");
  const c = h.coordinates;
  if (!c && !h.nearby.length) return null;
  const d = 0.012;
  const map = c ? `https://www.openstreetmap.org/export/embed.html?bbox=${c.lng - d * 1.6},${c.lat - d},${c.lng + d * 1.6},${c.lat + d}&layer=mapnik&marker=${c.lat},${c.lng}` : null;
  const open = c ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` : null;
  const List = ({ items, icon: I }: { items: typeof h.nearby; icon: LucideIcon }) => (
    <ul className="divide-y divide-line">
      {items.map((n) => (
        <li key={n.name} className="flex items-center justify-between gap-4 py-2.5 text-[14px]">
          <span className="flex min-w-0 items-center gap-2.5 text-ink">
            <I className="h-4 w-4 shrink-0 text-muted" aria-hidden /> <span className="truncate">{n.name}</span>
          </span>
          {n.distance && <span className="shrink-0 font-semibold tabular text-ink/70">{n.distance}</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <section id="localizacao" className="scroll-mt-36">
      <SectionHeading eyebrow="Localização" title="Onde fica">
        {open && (
          <a href={open} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-[14px] font-semibold text-ink ring-1 ring-inset ring-black/10 transition hover:ring-ink/30">
            Abrir no mapa <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
      </SectionHeading>
      <div className={map ? "grid gap-6 lg:grid-cols-[1.35fr_1fr]" : ""}>
        {map && (
          <div className="overflow-hidden rounded-[1.75rem] bg-surface ring-1 ring-inset ring-black/[0.06]">
            <iframe title={`Mapa: ${title}`} src={map} loading="lazy" className="h-[340px] w-full border-0 sm:h-[420px]" referrerPolicy="no-referrer" />
            <p className="flex items-start gap-2 px-5 py-4 text-[14px] text-ink">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden /> {address}
            </p>
          </div>
        )}
        {(places.length > 0 || airports.length > 0) && (
          <div className="space-y-6">
            {places.length > 0 && (
              <div>
                <p className="mb-1 text-[15px] font-semibold text-ink">O que tem por perto</p>
                <List items={places.slice(0, 12)} icon={MapPin} />
              </div>
            )}
            {airports.length > 0 && (
              <div>
                <p className="mb-1 text-[15px] font-semibold text-ink">Aeroportos</p>
                <List items={airports.slice(0, 4)} icon={Plane} />
              </div>
            )}
            <p className="text-[12px] text-muted">Distâncias em linha reta, informadas pelo hotel.</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ───────────────────────── Políticas ─────────────────────────

export function HotelPolicies({ h }: { h: HotelContent }) {
  const t = h.times;
  const hasTimes = t.checkInFrom || t.checkOutUntil || t.minAge;
  if (!hasTimes && !h.policies.length) return null;
  return (
    <section id="politicas" className="scroll-mt-36">
      <SectionHeading eyebrow="Antes de reservar" title="Políticas e informações" />
      <div className="grid items-start gap-4 md:grid-cols-2">
        {hasTimes && (
          <div className="rounded-[1.5rem] bg-surface p-5 sm:p-6">
            <p className="flex items-center gap-2 text-[16px] font-semibold text-ink">
              <Clock className="h-[18px] w-[18px] text-accent-ink" aria-hidden /> Check-in e check-out
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              {t.checkInFrom && (
                <div className="rounded-2xl bg-white p-4">
                  <dt className="text-[12px] text-muted">Check-in</dt>
                  <dd className="text-[17px] font-semibold text-ink">
                    a partir das {t.checkInFrom}
                    {t.checkInUntil && <span className="block text-[13px] font-medium text-muted">até as {t.checkInUntil}</span>}
                  </dd>
                </div>
              )}
              {t.checkOutUntil && (
                <div className="rounded-2xl bg-white p-4">
                  <dt className="text-[12px] text-muted">Check-out</dt>
                  <dd className="text-[17px] font-semibold text-ink">até as {t.checkOutUntil}</dd>
                </div>
              )}
              {t.minAge && (
                <div className="col-span-2 rounded-2xl bg-white p-4">
                  <dt className="text-[12px] text-muted">Idade mínima do responsável no check-in</dt>
                  <dd className="text-[17px] font-semibold text-ink">{t.minAge} anos</dd>
                </div>
              )}
            </dl>
          </div>
        )}
        {h.policies.map((p) => (
          <div key={p.title} className="rounded-[1.5rem] bg-surface p-5 sm:p-6">
            <p className="flex items-center gap-2 text-[16px] font-semibold text-ink">
              <Info className="h-[18px] w-[18px] text-accent-ink" aria-hidden /> {p.title}
            </p>
            <ul className="mt-3 space-y-2">
              {p.items.map((it) => (
                <li key={it} className="flex items-start gap-2 text-[14px] leading-relaxed text-ink/80">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/30" aria-hidden /> {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
