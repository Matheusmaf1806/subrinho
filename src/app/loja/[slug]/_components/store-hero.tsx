/**
 * Topo da página inicial — a busca é a protagonista, sobre papel quadriculado na cor da agência.
 * Ao lado, as fotos em blocos retangulares sobrepostos (bloco de cor deslocado, foto secundária
 * quadrada, etiquetas retangulares com sombra dura), alinhados à grade de 32px.
 * Abaixo, uma faixa de destinos correndo. Tudo nas cores, fotos e título de cada agência.
 */
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, MessageCircle, Plane } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { SearchTabs } from "./search-tabs";

type Tab = { key: string; label: string; icon: ReactNode; content: ReactNode };
const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

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
        {/* celular: foto da agência com grade por cima, atrás do cartão */}
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[310px] lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/35 to-black/15" />
          <div className="grid-paper grid-paper-light absolute inset-0" />
        </div>
        {/* desktop: papel quadriculado na cor da agência */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 hidden bg-gradient-to-b from-brand-50 via-brand-50/60 to-white lg:block" />
        <div aria-hidden className="grid-paper pointer-events-none absolute inset-0 -z-20 hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)] lg:block" />

        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-4 pb-4 pt-8 sm:px-8 lg:grid-cols-[minmax(0,700px)_minmax(0,1fr)] lg:gap-12 lg:pb-12 lg:pt-14">
          {/* ── título + busca ── */}
          <div>
            <h1 data-enter className="max-w-[18ch] text-[clamp(2.1rem,4.4vw,4.1rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-white drop-shadow-sm lg:max-w-none lg:text-ink lg:drop-shadow-none">
              {head.map((l, i) => (
                <span key={i}>{l} </span>
              ))}
              {/* marca-texto: no celular bloco na cor da marca (texto branco sobre a foto); no computador, tom claro */}
              <span className="marker whitespace-nowrap [--marker:var(--color-accent)] lg:text-accent-ink lg:[--marker:var(--color-brand-100)]">{last}</span>
            </h1>
            {subtitle && <p className="mt-5 hidden max-w-xl text-[16px] leading-relaxed text-muted lg:block">{subtitle}</p>}

            <div className="relative mt-8" data-enter style={d(140)}>
              <div className="relative rounded-[1.25rem] bg-white p-4 shadow-[0_30px_60px_-35px_rgba(0,0,0,0.45)] ring-1 ring-ink/10 sm:p-6 lg:shadow-[10px_10px_0_0_var(--color-brand-200)]">
                {tabs.length > 0 ? (
                  <SearchTabs tabs={tabs} variant="underline" />
                ) : (
                  <p className="py-6 text-center text-[15px] text-muted">Em breve, produtos para a sua viagem.</p>
                )}
                <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-[13px] text-muted sm:justify-center sm:text-center">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
                  <span>{note}</span>
                </p>
              </div>
            </div>
          </div>

          {/* ── blocos sobrepostos (desktop): palco proporcional 600×580 ── */}
          <div className="relative ml-auto hidden aspect-[600/580] w-full max-w-[640px] lg:block">
            {/* bloco de cor deslocado atrás da foto principal */}
            <div data-enter style={d(60)} className="absolute right-0 top-[8%] h-[80%] w-[60%] rounded-[1.25rem] bg-accent">
              <div className="grid-paper grid-paper-light absolute inset-0 rounded-[1.25rem]" aria-hidden />
            </div>
            {/* quadrado de cor (alinhado à grade) */}
            <div aria-hidden className="absolute left-[12%] top-[6%] h-[20%] w-[20%] rounded-[1rem] bg-brand-200/70" />

            {/* foto principal */}
            <div data-enter style={d(120)} className="absolute right-[7%] top-0 h-[82%] w-[60%] overflow-hidden rounded-[1.25rem] bg-surface ring-1 ring-black/5 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.55)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="h-full w-full object-cover" fetchPriority="high" />
            </div>

            {/* foto secundária quadrada, com moldura e sombra dura */}
            <div data-drop style={d(360)} className="absolute bottom-[3%] left-[4%] aspect-square w-[36%] overflow-hidden rounded-[1rem] bg-white p-2 [--hs:var(--color-ink)] hard-shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image2} alt="" className="h-full w-full rounded-[0.6rem] object-cover" />
            </div>

            {/* bloco pequeno na cor da marca com o avião */}
            <span data-drop style={d(520)} className="absolute left-[33%] top-[16%] grid h-14 w-14 place-items-center rounded-xl bg-white text-ink ring-1 ring-ink/10 [--hs:var(--color-accent)] [--hx:5px] [--hy:5px] hard-shadow" aria-hidden>
              <Plane className="h-6 w-6" />
            </span>

            {/* etiqueta retangular */}
            <span data-drop style={d(620)} className="absolute right-[-2%] top-[10%] rounded-xl bg-ink px-5 py-3.5 text-white [--hs:var(--color-accent)] [--hx:6px] [--hy:6px] hard-shadow">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">Pague em até</span>
              <span className="block text-[21px] font-semibold leading-tight tracking-[-0.02em]">
                {maxInstallments}x <span className="text-accent">sem juros</span>
              </span>
            </span>

            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                data-drop
                style={d(760)}
                className="group absolute bottom-[8%] right-[1%] z-10 flex items-center gap-3 rounded-xl bg-white py-3 pl-3 pr-4 ring-1 ring-ink/10 [--hs:var(--color-ink)] [--hx:5px] [--hy:5px] hard-shadow transition hover:translate-x-[2px] hover:translate-y-[2px] hover:[--hx:3px] hover:[--hy:3px]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-fg">
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
        <div className="relative mt-8 overflow-x-clip lg:mt-2">
          <div className="border-y-2 border-ink bg-ink py-3.5 text-white">
            <div className="marquee flex w-max items-center">
              {[0, 1].map((copy) => (
                <ul key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                  {destinations.map((x) => (
                    <li key={`${copy}-${x.name}`} className="flex items-center">
                      <Link href={x.href} tabIndex={copy === 1 ? -1 : undefined} className="px-6 text-[clamp(1.25rem,2.2vw,1.9rem)] font-semibold tracking-[-0.03em] transition hover:text-accent">
                        {x.name}
                      </Link>
                      <span className="inline-block h-2.5 w-2.5 bg-accent" aria-hidden />
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
