/**
 * Seções da página do hotel (servidor): visão geral, painel de reserva, comodidades, localização e
 * políticas. Tudo a partir do conteúdo do fornecedor já organizado (HotelContent); seção sem dados
 * não aparece. Tamanhos de texto: títulos de seção iguais, corpo 14–16 px em todas as seções.
 */
import type { ReactNode } from "react";
import {
  Accessibility,
  Baby,
  BadgeCheck,
  BedDouble,
  CircleParking,
  Coffee,
  ConciergeBell,
  ExternalLink,
  IdCard,
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
  type LucideIcon,
} from "lucide-react";
import type { HotelContent } from "@/server/suppliers/types";
import { brl, date } from "@/lib/format";
import type { InstallmentPlan } from "@/server/pricing/engine";
import type { Decimal } from "@/server/pricing/money";
import { cn } from "@/components/ui";
import { CommissionBox, type Commission } from "../reveal";
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
        <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-none tracking-[-0.045em] text-ink">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/** Lista que mostra os primeiros itens e o resto em "Ver mais" (sem JS). */
function Collapsible({ items, max, render, className }: { items: string[]; max: number; render: (it: string) => ReactNode; className?: string }) {
  const head = items.length > max + 1 ? items.slice(0, max) : items;
  const tail = items.slice(head.length);
  return (
    <div className={className}>
      <ul className="space-y-2">{head.map(render)}</ul>
      {tail.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
            <span className="group-open:hidden">Ver mais {tail.length}</span>
            <span className="hidden group-open:inline">Mostrar menos</span>
          </summary>
          <ul className="mt-2 space-y-2">{tail.map(render)}</ul>
        </details>
      )}
    </div>
  );
}

// ───────────────────────── Visão geral ─────────────────────────

export function HotelOverview({ h, allAmenities }: { h: HotelContent; allAmenities: string[] }) {
  const titled = h.about.filter((a) => a.title);
  const lead = titled.length ? titled.filter((a) => /localiza|quartos/i.test(a.title!)) : h.about.slice(0, 2);
  const rest = h.about.filter((a) => !lead.includes(a));
  const top = topAmenities(allAmenities, 8);
  const facts: { icon: LucideIcon; text: string }[] = [
    ...h.facts.slice(0, 2).map((f) => ({ icon: Info, text: `${f.label}: ${f.value}` })),
    ...(h.times.minAge ? [{ icon: IdCard, text: `Idade mínima no check-in: ${h.times.minAge} anos` }] : []),
    ...(h.languages.length ? [{ icon: Languages, text: `Idiomas: ${h.languages.join(", ")}` }] : []),
  ];
  return (
    <div className="min-w-0 space-y-8">
      <div className="space-y-5">
        {lead.map((a, i) => (
          <div key={i}>
            {a.title && <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">{a.title}</p>}
            <p className="text-[16px] leading-relaxed text-ink/85">{a.text}</p>
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
      {facts.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {facts.map((f) => (
            <li key={f.text} className="inline-flex items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-[13px] font-medium text-ink">
              <f.icon className="h-4 w-4 text-muted" aria-hidden /> {f.text}
            </li>
          ))}
        </ul>
      )}
      {top.length > 0 && (
        <div>
          <p className="mb-3 text-[16px] font-semibold text-ink">Destaques do hotel</p>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {top.map(({ text, Icon }) => (
              <li key={text} className="flex items-center gap-3 text-[14px] leading-snug text-ink">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-accent-ink">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
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

// ───────────────────────── Painel de reserva (lateral fixa) ─────────────────────────

type Price = { pix: Decimal; plan: InstallmentPlan; commission?: Commission };

/**
 * Painel lateral que acompanha a rolagem: preço a partir de, comissão (ADMIN), datas com os
 * horários do hotel, destaques das tarifas e o botão para os quartos.
 */
export function BookingSummary({
  h,
  price,
  options,
  checkIn,
  checkOut,
  nights,
  pax,
  breakfast,
  freeCancel,
}: {
  h: HotelContent;
  price: Price | null;
  options: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  pax: string;
  breakfast: number;
  freeCancel: number;
}) {
  const t = h.times;
  return (
    <div className="rounded-[1.75rem] bg-white p-6 ring-1 ring-inset ring-black/[0.07] shadow-[0_30px_80px_-50px_rgba(10,10,11,0.5)]">
      {price ? (
        <>
          <p className="text-[13px] text-muted">a partir de</p>
          <p className="mt-0.5 flex items-baseline gap-1.5 text-[2rem] font-semibold leading-none tracking-[-0.04em] text-ink tabular">
            {brl(price.pix)} <span className="text-[13px] font-semibold tracking-normal text-accent-ink">no Pix</span>
          </p>
          <p className="mt-1.5 text-[13px] text-muted tabular">
            ou <span className="text-ink">{price.plan.count}x de {brl(price.plan.installment)}</span> sem juros
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            total da estadia · {nights} noite{nights > 1 ? "s" : ""} · {pax}
          </p>
          <CommissionBox c={price.commission} className="mt-4 w-full" />
        </>
      ) : (
        <p className="text-[15px] font-semibold text-ink">Sem quartos para estas datas</p>
      )}

      <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-2xl ring-1 ring-inset ring-line">
        <div className="p-3.5">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            <LogIn className="h-3.5 w-3.5" aria-hidden /> Check-in
          </dt>
          <dd className="mt-1 text-[14px] font-semibold text-ink">{date(checkIn)}</dd>
          {t.checkInFrom && <dd className="text-[12px] text-muted">a partir das {t.checkInFrom}</dd>}
        </div>
        <div className="border-l border-line p-3.5">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Check-out
          </dt>
          <dd className="mt-1 text-[14px] font-semibold text-ink">{date(checkOut)}</dd>
          {t.checkOutUntil && <dd className="text-[12px] text-muted">até as {t.checkOutUntil}</dd>}
        </div>
      </dl>

      {(breakfast > 0 || freeCancel > 0) && (
        <ul className="mt-4 space-y-1.5 text-[13px] text-ink">
          {freeCancel > 0 && (
            <li className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Cancelamento grátis em {freeCancel === options ? "todas as opções" : `${freeCancel} opç${freeCancel > 1 ? "ões" : "ão"}`}
            </li>
          )}
          {breakfast > 0 && (
            <li className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-accent-ink" aria-hidden /> Café da manhã em {breakfast === options ? "todas as opções" : `${breakfast} opç${breakfast > 1 ? "ões" : "ão"}`}
            </li>
          )}
        </ul>
      )}

      <a href="#quartos" className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-accent-fg transition hover:opacity-90">
        {price ? `Ver ${options} opç${options > 1 ? "ões" : "ão"} de quarto` : "Alterar a busca"} <span aria-hidden>↓</span>
      </a>
      <a href="#alterar-busca" className="mt-2 block text-center text-[13px] font-semibold text-muted underline decoration-ink/20 underline-offset-4 hover:text-ink">
        Alterar datas ou hóspedes
      </a>
    </div>
  );
}

/** Barra fixa no rodapé do celular (o painel lateral só aparece no computador). */
export function MobileBookingBar({ price, nights }: { price: Price | null; nights: number }) {
  if (!price) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 py-3 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] text-muted">a partir de · {nights} noite{nights > 1 ? "s" : ""}</p>
          <p className="text-[19px] font-semibold tracking-[-0.03em] text-ink tabular">
            {brl(price.pix)} <span className="text-[12px] font-semibold text-accent-ink">Pix</span>
          </p>
          {price.commission && <p className="text-[12px] font-semibold text-emerald-700 tabular">comissão {brl(price.commission.amount)}</p>}
        </div>
        <a href="#quartos" className="inline-flex h-11 shrink-0 items-center rounded-full bg-accent px-5 text-[14px] font-semibold text-accent-fg">
          Ver quartos
        </a>
      </div>
    </div>
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
    <section id="comodidades" className="scroll-mt-[calc(var(--store-top,72px)+72px)]">
      <SectionHeading eyebrow="Comodidades" title="O que o hotel oferece" />
      <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const Icon = GROUP_ICON[g.group] ?? ConciergeBell;
          return (
            <div key={g.group} className="min-w-0">
              <p className="flex items-center gap-2.5 border-b border-line pb-3 text-[15px] font-semibold text-ink">
                <Icon className="h-[18px] w-[18px] text-accent-ink" aria-hidden />
                {g.group}
                <span className="ml-auto text-[12px] font-medium text-muted tabular">{g.items.length}</span>
              </p>
              <Collapsible
                items={g.items}
                max={6}
                className="mt-3"
                render={(it) => {
                  const I = amenityIcon(it);
                  return (
                    <li key={it} className="flex items-start gap-2.5 text-[14px] leading-snug text-ink/85">
                      <I className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /> {it}
                    </li>
                  );
                }}
              />
            </div>
          );
        })}
      </div>
      {h.roomAmenities.length > 0 && <p className="mt-6 text-[12px] text-muted">O que há nos quartos pode variar conforme o tipo de quarto.</p>}
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
    <section id="localizacao" className="scroll-mt-[calc(var(--store-top,72px)+72px)]">
      <SectionHeading eyebrow="Localização" title="Onde fica">
        {open && (
          <a href={open} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-[14px] font-semibold text-ink ring-1 ring-inset ring-black/10 transition hover:ring-ink/30">
            Abrir no mapa <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
      </SectionHeading>
      {map && (
        <div className="overflow-hidden rounded-[1.75rem] bg-surface ring-1 ring-inset ring-black/[0.06]">
          <iframe title={`Mapa: ${title}`} src={map} loading="lazy" className="h-[320px] w-full border-0 sm:h-[380px]" referrerPolicy="no-referrer" />
          <p className="flex items-start gap-2 px-5 py-4 text-[14px] text-ink">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden /> {address}
          </p>
        </div>
      )}
      {(places.length > 0 || airports.length > 0) && (
        <div className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {places.length > 0 && (
            <div>
              <p className="mb-1 text-[15px] font-semibold text-ink">O que tem por perto</p>
              <List items={places.slice(0, 10)} icon={MapPin} />
            </div>
          )}
          {airports.length > 0 && (
            <div>
              <p className="mb-1 text-[15px] font-semibold text-ink">Aeroportos</p>
              <List items={airports.slice(0, 4)} icon={Plane} />
              <p className="mt-3 text-[12px] text-muted">Distâncias em linha reta, informadas pelo hotel.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Políticas ─────────────────────────

/** Uma linha por assunto (título à esquerda, conteúdo à direita), todas no mesmo tamanho. */
export function HotelPolicies({ h }: { h: HotelContent }) {
  const t = h.times;
  const rows: { title: string; content: ReactNode }[] = [];
  if (t.checkInFrom || t.checkInUntil) rows.push({ title: "Check-in", content: <p>{[t.checkInFrom && `a partir das ${t.checkInFrom}`, t.checkInUntil && `até as ${t.checkInUntil}`].filter(Boolean).join(" · ")}</p> });
  if (t.checkOutUntil) rows.push({ title: "Check-out", content: <p>até as {t.checkOutUntil}</p> });
  if (t.minAge) rows.push({ title: "Idade mínima", content: <p>{t.minAge} anos para o responsável pela reserva</p> });
  for (const p of h.policies) {
    rows.push({
      title: p.title,
      content: (
        <Collapsible
          items={p.items}
          max={4}
          render={(it) => (
            <li key={it} className="flex items-start gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink/40" aria-hidden /> {it}
            </li>
          )}
        />
      ),
    });
  }
  if (!rows.length) return null;
  return (
    <section id="politicas" className="scroll-mt-[calc(var(--store-top,72px)+72px)]">
      <SectionHeading eyebrow="Antes de reservar" title="Políticas e informações" />
      <dl className="divide-y divide-line overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-inset ring-black/[0.07]">
        {rows.map((r) => (
          <div key={r.title} className="grid gap-1.5 px-5 py-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6 sm:px-6">
            <dt className="text-[15px] font-semibold text-ink">{r.title}</dt>
            <dd className={cn("text-[14px] leading-relaxed text-ink/80")}>{r.content}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
