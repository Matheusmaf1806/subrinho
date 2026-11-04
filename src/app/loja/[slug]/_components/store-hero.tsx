/**
 * Topo da página inicial: título + cartão de busca à esquerda e, à direita, um mosaico de
 * quadrados alinhados (grade 4×4): fotos da agência e de destinos, atalhos para as categorias e
 * blocos com as garantias reais da compra. Fundo com quadriculado fino que some em degradê.
 * Tudo nas cores, fotos e título de cada agência.
 */
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, MessageCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/components/ui";
import { photo, type PhotoKey } from "@/lib/images";
import { SearchTabs } from "./search-tabs";

type Tab = { key: string; label: string; icon: ReactNode; content: ReactNode };
type Shortcut = { href: string; label: string; icon: LucideIcon };
const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** Foto quadrada do mosaico, com etiqueta opcional (nome do destino). */
function PhotoTile({ src, label, className, delay, priority }: { src: string; label?: string; className?: string; delay: number; priority?: boolean }) {
  return (
    <div data-drop style={d(delay)} className={cn("group relative overflow-hidden rounded-2xl bg-surface", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover transition duration-[1.2s] ease-out group-hover:scale-105" fetchPriority={priority ? "high" : undefined} loading={priority ? "eager" : "lazy"} />
      {label && <span className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1 text-[12px] font-semibold text-ink backdrop-blur">{label}</span>}
    </div>
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
  shortcuts,
  destinations,
}: {
  name: string;
  lines: string[];
  /** Só quando a agência escreveu um subtítulo. */
  subtitle: string | null;
  image: string;
  image2: string;
  tabs: Tab[];
  pixAvailable: boolean;
  maxInstallments: number;
  whatsapp: string | null;
  /** Atalhos para as categorias que a loja vende (até 3). */
  shortcuts: Shortcut[];
  /** Faixa de destinos correndo (link para a busca). */
  destinations: { name: string; href: string }[];
}) {
  const wa = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : null;
  const note = [`Até ${maxInstallments}x sem juros`, pixAvailable ? "desconto no Pix" : null, "preço e disponibilidade confirmados antes de pagar"].filter(Boolean).join(" · ");
  const head = lines.slice(0, -1);
  const last = lines.at(-1) ?? "";
  const dest = (key: PhotoKey, w = 600, h = 600) => photo(key, w, h);
  const [s1, s2, s3] = shortcuts;

  /** Atalho de categoria (quadrado na cor da marca / escuro / claro). */
  const shortcut = (s: Shortcut | undefined, tone: "brand" | "ink" | "light", className: string, delay: number) => {
    if (!s)
      return (
        <div data-drop style={d(delay)} className={cn("flex flex-col justify-between rounded-2xl bg-brand-50 p-4 text-accent-ink ring-1 ring-inset ring-brand-100", className)}>
          <ShieldCheck className="h-6 w-6" aria-hidden />
          <span className="text-[14px] font-semibold leading-tight">Compra segura</span>
        </div>
      );
    const t = tone === "brand" ? "bg-accent text-accent-fg" : tone === "ink" ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-inset ring-ink/10";
    return (
      <Link data-drop style={d(delay)} href={s.href} className={cn("group flex flex-col justify-between rounded-2xl p-4 transition duration-300 hover:-translate-y-1", t, className)}>
        <span className="flex items-start justify-between">
          <s.icon className="h-6 w-6" aria-hidden />
          <ArrowUpRight className="h-4 w-4 opacity-60 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
        </span>
        <span className="text-[15px] font-semibold leading-tight tracking-[-0.02em]">{s.label}</span>
      </Link>
    );
  };

  return (
    <>
      <section className="relative isolate overflow-x-clip">
        {/* fundo: tom da marca + quadriculado fino que some em degradê + brilho suave atrás do mosaico */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-b from-brand-50/80 via-white to-white" />
        <div aria-hidden className="grid-paper pointer-events-none absolute inset-0 -z-20 [--fade-at:70%_30%]" />
        <div aria-hidden className="pointer-events-none absolute right-[8%] top-[10%] -z-20 hidden h-[520px] w-[520px] rounded-full bg-brand-100 opacity-60 blur-[90px] lg:block" />

        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-4 pb-6 pt-8 sm:px-8 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)] lg:gap-14 lg:pb-14 lg:pt-14">
          {/* ── título + busca ── */}
          <div>
            <p data-enter className="mb-5 inline-flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-ink ring-1 ring-inset ring-brand-100">
              <span className="h-2 w-2 bg-accent" aria-hidden /> {name}
            </p>
            <h1 data-enter style={d(60)} className="text-[clamp(2.4rem,4.6vw,4.4rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-ink">
              {head.map((l, i) => (
                <span key={i} className="block">
                  {l}
                </span>
              ))}
              <span className="block text-accent-ink">{last}</span>
            </h1>
            {subtitle && (
              <p data-enter style={d(100)} className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted">
                {subtitle}
              </p>
            )}

            <div data-enter style={d(160)} className="mt-8 rounded-[1.5rem] bg-white p-4 shadow-[0_40px_90px_-45px_rgba(10,10,11,0.45)] ring-1 ring-ink/[0.08] sm:p-6">
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

          {/* ── mosaico 4×4 (desktop) ── */}
          <div className="ml-auto hidden aspect-square w-full max-w-[600px] grid-cols-4 grid-rows-4 gap-3 lg:grid">
            <PhotoTile src={image} className="col-span-2 row-span-2" delay={80} priority />
            {shortcut(s1, "brand", "", 200)}
            <PhotoTile src={dest("colosseum", 400, 820)} label="Roma" className="row-span-2" delay={260} />
            {shortcut(s2, "light", "", 320)}
            <PhotoTile src={image2} className="row-span-2" delay={380} />
            <div data-drop style={d(440)} className="col-span-2 flex flex-col justify-between rounded-2xl bg-ink p-5 text-white">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Pague em até</span>
              <span className="text-[clamp(1.6rem,2.4vw,2.25rem)] font-semibold leading-none tracking-[-0.04em]">
                {maxInstallments}x <span className="text-accent">sem juros</span>
              </span>
            </div>
            {shortcut(s3, "ink", "", 500)}
            <PhotoTile src={dest("eiffel", 400, 400)} label="Paris" delay={560} />
            {wa ? (
              <a
                data-drop
                style={d(620)}
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="group col-span-2 flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-inset ring-ink/10 transition duration-300 hover:-translate-y-1"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
                  <MessageCircle className="h-6 w-6" aria-hidden />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block text-[12px] text-muted">Dúvidas sobre a viagem?</span>
                  <span className="flex items-center gap-1 text-[15px] font-semibold text-ink">
                    <span className="truncate">Fale com a {name}</span> <ArrowUpRight className="h-4 w-4 shrink-0 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </a>
            ) : (
              <PhotoTile src={dest("lisbon", 820, 400)} label="Lisboa" className="col-span-2" delay={620} />
            )}
          </div>
        </div>

        {/* celular: mosaico compacto abaixo da busca */}
        <div className="mx-auto px-4 pb-2 sm:px-8 lg:hidden">
          <div className="grid aspect-[2/1] grid-cols-4 grid-rows-2 gap-2">
          <PhotoTile src={image} className="col-span-2 row-span-2" delay={200} />
          {shortcut(s1, "brand", "p-3 [&_span:last-child]:text-[13px]", 260)}
          {shortcut(s2, "light", "p-3 [&_span:last-child]:text-[13px]", 320)}
          <div className="col-span-2 flex flex-col justify-center rounded-2xl bg-ink px-3 text-white">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">Pague em até</span>
            <span className="text-[1.2rem] font-semibold leading-tight tracking-[-0.03em]">
              {maxInstallments}x <span className="text-accent">sem juros</span>
            </span>
          </div>
          </div>
        </div>
      </section>

      {/* ── faixa de destinos correndo ── */}
      {destinations.length > 0 && (
        <div className="relative mt-8 overflow-x-clip lg:mt-2">
          <div className="bg-ink py-3.5 text-white">
            <div className="marquee flex w-max items-center">
              {[0, 1].map((copy) => (
                <ul key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                  {destinations.map((x) => (
                    <li key={`${copy}-${x.name}`} className="flex items-center">
                      <Link href={x.href} tabIndex={copy === 1 ? -1 : undefined} className="px-6 text-[clamp(1.25rem,2.2vw,1.9rem)] font-semibold tracking-[-0.03em] transition hover:text-accent">
                        {x.name}
                      </Link>
                      <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-accent" aria-hidden />
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
