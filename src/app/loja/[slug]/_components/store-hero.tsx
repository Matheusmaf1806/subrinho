/**
 * Topo da página inicial — a busca é a protagonista, num clima de "diário de viagem": papel com
 * grão e pontilhado, título com traço à mão, cartão de busca com abas por produto e, ao lado, as
 * fotos da agência (arco + selo postal com carimbo), rota tracejada e etiqueta de bagagem.
 * Abaixo, uma faixa de destinos correndo. Tudo nas cores, fotos e título de cada agência.
 */
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, MessageCircle, Plane } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { SearchTabs } from "./search-tabs";

type Tab = { key: string; label: string; icon: ReactNode; content: ReactNode };

/** Traço feito à mão sob a última linha do título. */
function Scribble({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 24" preserveAspectRatio="none" className={className} aria-hidden>
      <path d="M4 15 C 70 4, 150 3, 214 9 S 330 21, 396 8" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <path d="M40 20 C 120 13, 230 13, 330 18" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

/** Curvas de nível (mapa topográfico) para dar textura ao fundo das fotos. */
function Contours({ className }: { className?: string }) {
  const rings = [60, 95, 132, 170, 210, 252, 296, 342];
  return (
    <svg viewBox="-400 -400 800 800" className={className} aria-hidden>
      {rings.map((r, i) => (
        <ellipse key={r} cx={i * 6 - 20} cy={i * -4 + 10} rx={r * 1.12} ry={r * 0.86} transform={`rotate(${-18 + i * 5})`} fill="none" stroke="currentColor" strokeWidth="1.4" />
      ))}
    </svg>
  );
}

/** Carimbo do correio com o nome da agência. */
function Postmark({ name, className }: { name: string; className?: string }) {
  const label = `${name.toUpperCase()} • BOA VIAGEM • `;
  return (
    <svg viewBox="0 0 260 140" className={className} aria-hidden>
      <defs>
        <path id="postmark-ring" d="M70,70 m-50,0 a50,50 0 1,1 100,0 a50,50 0 1,1 -100,0" />
      </defs>
      <circle cx="70" cy="70" r="64" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="70" cy="70" r="38" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text fontSize="11.5" fontWeight="700" fill="currentColor" letterSpacing="1">
        <textPath href="#postmark-ring" textLength="312" lengthAdjust="spacingAndGlyphs">
          {label}
        </textPath>
      </text>
      <text x="70" y="69" textAnchor="middle" fontSize="18" fontWeight="800" fill="currentColor">
        {new Date().getFullYear()}
      </text>
      <text x="70" y="84" textAnchor="middle" fontSize="8" fontWeight="700" letterSpacing="2" fill="currentColor">
        BRASIL
      </text>
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M140 ${44 + i * 17} q 15 -9 30 0 t 30 0 t 30 0 t 30 0`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      ))}
    </svg>
  );
}

export function StoreHero({
  name,
  lines,
  subtitle,
  image,
  image2,
  tabs,
  pixAvailable,
  maxInstallments,
  whatsapp,
  destinations,
}: {
  name: string;
  lines: string[];
  /** Só quando a agência escreveu um subtítulo (no celular fica escondido para a busca subir). */
  subtitle: string | null;
  image: string;
  image2: string;
  tabs: Tab[];
  pixAvailable: boolean;
  maxInstallments: number;
  whatsapp: string | null;
  /** Faixa de destinos correndo (link para a busca). */
  destinations: { name: string; href: string }[];
}) {
  const wa = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : null;
  const note = [`Até ${maxInstallments}x sem juros`, pixAvailable ? "desconto no Pix" : null, "preço e disponibilidade confirmados antes de pagar"].filter(Boolean).join(" · ");
  const head = lines.slice(0, -1);
  const last = lines.at(-1) ?? "";

  return (
    <>
      <section className="relative isolate overflow-x-clip">
        {/* ── fundos ── */}
        {/* celular: foto da agência (com grão) atrás do cartão */}
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[310px] lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/10" />
          <div className="grain absolute inset-0 opacity-40 mix-blend-overlay" />
        </div>
        {/* desktop: papel na cor da agência com grão e pontilhado */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 hidden bg-gradient-to-b from-brand-50 via-brand-50/70 to-white lg:block" />
        <div aria-hidden className="grain pointer-events-none absolute inset-0 -z-20 hidden opacity-[0.14] mix-blend-multiply [mask-image:linear-gradient(to_bottom,black_65%,transparent)] lg:block" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-20 hidden bg-[radial-gradient(circle,var(--color-brand-200)_1.2px,transparent_1.6px)] bg-[length:22px_22px] [mask-image:radial-gradient(ellipse_55%_60%_at_18%_30%,black,transparent)] lg:block"
        />

        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-4 pb-4 pt-8 sm:px-8 lg:grid-cols-[minmax(0,700px)_minmax(0,1fr)] lg:gap-12 lg:pb-10 lg:pt-12">
          {/* ── título + busca ── */}
          <div>
            <h1 className="max-w-[18ch] text-[clamp(2.1rem,4.4vw,4.1rem)] font-semibold leading-[1] tracking-[-0.045em] text-white drop-shadow-sm lg:max-w-none lg:text-ink lg:drop-shadow-none">
              {head.map((l, i) => (
                <span key={i}>{l} </span>
              ))}
              <span className="relative inline-block whitespace-nowrap lg:text-accent-ink">
                {last}
                <Scribble className="absolute -bottom-2 left-0 h-3 w-full text-accent lg:-bottom-3 lg:h-4" />
              </span>
            </h1>
            {subtitle && <p className="mt-5 hidden max-w-xl text-[16px] leading-relaxed text-muted lg:block">{subtitle}</p>}

            <div className="relative mt-8">
              {/* "papel de baixo": cartão empilhado, levemente girado */}
              <div aria-hidden className="absolute inset-0 hidden translate-x-2 translate-y-3 rotate-[1.2deg] rounded-[1.75rem] bg-brand-100 lg:block" />
              <div className="relative rounded-[1.75rem] bg-white p-4 shadow-[0_30px_80px_-35px_rgba(10,10,11,0.45)] ring-1 ring-black/[0.06] sm:p-6">
                {tabs.length > 0 ? (
                  <SearchTabs tabs={tabs} variant="underline" />
                ) : (
                  <p className="py-6 text-center text-[15px] text-muted">Em breve, produtos para a sua viagem.</p>
                )}
                <p className="mt-5 flex items-start gap-2 border-t border-dashed border-line pt-4 text-[13px] text-muted sm:justify-center sm:text-center">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
                  <span>{note}</span>
                </p>
              </div>
            </div>
          </div>

          {/* ── colagem de fotos (desktop): palco proporcional 600×580, escala com a coluna ── */}
          <div className="relative ml-auto hidden aspect-[600/580] w-full max-w-[640px] lg:block">
            <Contours className="pointer-events-none absolute -right-[25%] top-1/2 aspect-square w-[135%] -translate-y-1/2 text-accent-ink/[0.13]" />
            <div aria-hidden className="absolute right-0 top-[1.5%] aspect-square w-[83%] rounded-full bg-brand-100/80" />

            {/* foto principal em arco (raio do topo = metade da largura) */}
            <div className="absolute right-[10.5%] top-0 h-[89.5%] w-[63%] rotate-[1.5deg] overflow-hidden rounded-b-[2.25rem] rounded-t-[50%_36%] bg-surface shadow-[0_40px_80px_-40px_rgba(0,0,0,0.55)] ring-[10px] ring-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="h-full w-full object-cover" fetchPriority="high" />
              <div className="grain absolute inset-0 opacity-25 mix-blend-overlay" aria-hidden />
            </div>

            {/* rota tracejada com avião (à esquerda do arco) */}
            <svg viewBox="0 0 220 170" className="absolute left-0 top-[3%] z-10 w-[30%] text-ink/35" aria-hidden>
              <path d="M10 160 C 30 70, 110 20, 196 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="2 9" strokeLinecap="round" />
            </svg>
            <span className="absolute left-[24%] top-[1.5%] z-10 grid h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-[0_10px_25px_-10px_rgba(0,0,0,0.5)] ring-1 ring-black/[0.05]" aria-hidden>
              <Plane className="h-5 w-5" />
            </span>

            {/* selo postal com a foto secundária + carimbo */}
            <div className="stamp absolute bottom-[4%] left-[6%] h-[41%] w-[33%] -rotate-[7deg] bg-white shadow-[0_25px_50px_-20px_rgba(0,0,0,0.5)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image2} alt="" className="h-full w-full object-cover" />
            </div>
            <Postmark name={name} className="pointer-events-none absolute bottom-[36%] left-0 z-10 w-[35%] -rotate-[12deg] text-accent-ink opacity-75 mix-blend-multiply" />

            {/* etiqueta de bagagem */}
            <span className="absolute right-0 top-[19%] flex rotate-[5deg] items-center gap-3 rounded-2xl bg-ink py-3 pl-3 pr-5 text-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
              <span className="relative h-2.5 w-2.5 rounded-full bg-brand-50 ring-2 ring-white/30" aria-hidden>
                <svg viewBox="0 0 60 40" className="absolute -left-12 -top-7 h-10 w-14 text-ink/40" aria-hidden>
                  <path d="M56 34 C 40 30, 26 6, 4 4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </span>
              <span className="leading-tight">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">Pague em até</span>
                <span className="block text-[19px] font-semibold tracking-[-0.02em]">
                  {maxInstallments}x <span className="text-accent">sem juros</span>
                </span>
              </span>
            </span>

            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="group absolute bottom-[6%] right-[2%] z-10 flex -rotate-[1.5deg] items-center gap-3 rounded-2xl bg-white py-3 pl-3 pr-4 shadow-[0_20px_40px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.05] transition hover:rotate-0"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-fg">
                  <MessageCircle className="h-5 w-5" aria-hidden />
                </span>
                <span className="leading-tight">
                  <span className="block text-[12px] text-muted">Dúvidas sobre a viagem?</span>
                  <span className="flex items-center gap-1 text-[14px] font-semibold text-ink">
                    Fale com a {name} <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ── faixa de destinos correndo ── */}
      {destinations.length > 0 && (
        <div className="relative mt-8 overflow-x-clip py-3 lg:mt-4">
          <div className="-mx-[3%] w-[106%] -rotate-[1.2deg] bg-ink py-3.5 text-white shadow-[0_20px_40px_-25px_rgba(0,0,0,0.6)]">
            <div className="marquee flex w-max items-center">
              {[0, 1].map((copy) => (
                <ul key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                  {destinations.map((d) => (
                    <li key={`${copy}-${d.name}`} className="flex items-center">
                      <Link href={d.href} tabIndex={copy === 1 ? -1 : undefined} className="px-6 text-[clamp(1.25rem,2.2vw,1.9rem)] font-semibold tracking-[-0.03em] transition hover:text-accent">
                        {d.name}
                      </Link>
                      <span className="text-accent" aria-hidden>
                        ✦
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
