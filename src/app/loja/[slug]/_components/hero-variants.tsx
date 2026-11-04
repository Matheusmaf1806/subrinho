/**
 * Quatro propostas de topo para a página inicial (prévia em ?topo=1..4). Todas recebem as mesmas
 * informações da agência (título, fotos, WhatsApp, categorias) e a mesma busca.
 *   1 · Cinemático   — só o banner: fotos de destino trocando sozinhas, busca flutuando na base.
 *   2 · Editorial    — título gigante de revista com fotos dentro das palavras e colunas numeradas.
 *   3 · Noturno      — fundo escuro com brilho na cor da marca, estrelas e fotos flutuando em 3D.
 *   4 · Centrado     — tudo no centro: busca grande em pílula, atalhos e destinos em degraus.
 */
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeCheck, MessageCircle, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/components/ui";
import { photo, type PhotoKey } from "@/lib/images";
import { SearchTabs } from "./search-tabs";

type Tab = { key: string; label: string; icon: ReactNode; content: ReactNode };
export type HeroProps = {
  name: string;
  lines: string[];
  subtitle: string;
  image: string;
  image2: string;
  /** Busca com campos em caixas (cartão) e em barra única. */
  tabsCard: Tab[];
  tabsBar: Tab[];
  pixAvailable: boolean;
  maxInstallments: number;
  whatsapp: string | null;
  shortcuts: { href: string; label: string; icon: LucideIcon }[];
  destinations: { name: string; href: string }[];
};

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const waLink = (w: string | null) => (w ? `https://wa.me/${w.replace(/\D/g, "")}` : null);
const trustLine = (p: HeroProps) => [`Até ${p.maxInstallments}x sem juros`, p.pixAvailable ? "desconto no Pix" : null, "preço confirmado antes de pagar"].filter(Boolean) as string[];

/** Fotos do banner do topo 1 (trocam a cada 6 s). */
const DEST: PhotoKey[] = ["vernazza", "colosseum", "eiffel", "lisbon"];

// ─────────────────────────────── 1 · Cinemático ───────────────────────────────
/** Só o banner: fotos de destino trocando sozinhas (sem texto por cima) e a busca flutuando na base. */
export function HeroCinematic(p: HeroProps) {
  return (
    <section className="px-3 pt-3 sm:px-4">
      {/* título só para leitores de tela e buscadores; o banner fica limpo */}
      <h1 className="sr-only">
        {p.name}: {p.lines.join(" ")}
      </h1>
      <div className="relative isolate mx-auto h-[340px] max-w-[1440px] overflow-hidden rounded-[2rem] bg-ink sm:h-[460px] sm:rounded-[2.5rem] lg:h-[min(62vh,580px)] lg:min-h-[480px]">
        {DEST.map((key, i) => (
          <div key={key} className="slide absolute inset-0 -z-20" style={{ "--slide-delay": `${i * 6}s` } as CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo(key, 2400, 1100)} alt="" className="h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} />
          </div>
        ))}
        {/* sombra só na base, para as abas da busca ficarem legíveis */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
        {/* andamento do banner (uma barrinha por foto) */}
        <div aria-hidden className="absolute right-5 top-5 flex gap-1.5 sm:right-8 sm:top-7">
          {DEST.map((key, i) => (
            <span key={key} className="slide-bar h-1 w-8 overflow-hidden rounded-full bg-white/35 sm:w-10" style={{ "--slide-delay": `${i * 6}s` } as CSSProperties}>
              <span className="block h-full w-full rounded-full bg-white" />
            </span>
          ))}
        </div>
      </div>
      {/* busca flutuando sobre a base do banner */}
      <div data-enter style={d(120)} className="relative z-10 mx-auto -mt-28 max-w-[1240px] px-3 sm:-mt-32 sm:px-10">
        {p.tabsBar.length > 0 && <SearchTabs tabs={p.tabsBar} tone="photo" />}
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[13px] text-muted">
          {trustLine(p).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-4 w-4 text-accent-ink" aria-hidden /> {t}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────── 2 · Editorial ───────────────────────────────
export function HeroEditorial(p: HeroProps) {
  const year = new Date().getFullYear();
  const words = p.lines.join(" ").split(/\s+/).filter(Boolean);
  // a última linha do título fica na cor da marca (como nas outras versões)
  const headCount = p.lines.length > 1 ? p.lines.slice(0, -1).join(" ").split(/\s+/).filter(Boolean).length : words.length - 1;
  const pill = (src: string, w: string) => (
    <span className={cn("mx-[0.14em] inline-block h-[0.78em] -translate-y-[0.06em] overflow-hidden rounded-full align-middle ring-[3px] ring-white", w)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </span>
  );
  // entre as palavras: foto depois da 1ª, foto antes da última, espaço no resto
  const gap = (i: number) => (i === 0 ? pill(p.image, "w-[1.65em]") : i === words.length - 2 && words.length > 2 ? pill(photo("vernazza", 400, 260), "w-[1.3em]") : " ");
  const cols = [
    { src: p.image2, n: "01", title: p.shortcuts[0]?.label ?? "Ingressos", href: p.shortcuts[0]?.href },
    { src: photo("colosseum", 600, 800), n: "02", title: p.shortcuts[1]?.label ?? "Hotéis", href: p.shortcuts[1]?.href },
    { src: photo("lisbon", 600, 800), n: "03", title: p.shortcuts[2]?.label ?? "Casas", href: p.shortcuts[2]?.href },
  ];
  return (
    <section className="mx-auto max-w-[1440px] px-4 pt-6 sm:px-8 sm:pt-10">
      <div className="flex items-center justify-between gap-4 border-b-2 border-ink pb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-ink" data-enter>
        <span>{p.name}</span>
        <span className="hidden sm:inline">Guia de viagem</span>
        <span>Edição {year}</span>
      </div>
      <h1 data-enter style={d(80)} className="mt-6 text-[clamp(3rem,10.5vw,10rem)] font-semibold leading-[0.88] tracking-[-0.065em] text-ink">
        {words.map((w, i) => (
          <span key={i}>
            <span className={i >= headCount ? "text-accent-ink" : undefined}>{w}</span>
            {i < words.length - 1 && gap(i)}
          </span>
        ))}
      </h1>

      {/* busca em largura total, logo abaixo do título */}
      <div data-enter style={d(160)} className="mt-8 sm:mt-10">
        {p.tabsBar.length > 0 && <SearchTabs tabs={p.tabsBar} tone="light" />}
        <p className="mt-3 text-[13px] text-muted">{trustLine(p).join(" · ")}</p>
      </div>

      {/* "sumário" da edição: texto + três colunas numeradas */}
      <div className="mt-12 grid gap-6 border-t border-ink pt-6 lg:grid-cols-4 lg:gap-5">
        <div data-enter style={d(200)} className="flex flex-col justify-between gap-6">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent-ink">Nesta edição</p>
            <p className="mt-3 max-w-md text-[17px] leading-relaxed text-ink/75">{p.subtitle}</p>
          </div>
          <p className="hidden text-[13px] leading-relaxed text-muted lg:block">
            Tudo no mesmo carrinho, com o atendimento da {p.name}.
          </p>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:col-span-3 lg:gap-5">
          {cols.map((c, i) => {
            const body = (
              <>
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.src} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-semibold tabular text-ink backdrop-blur">{c.n}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[19px] font-semibold tracking-[-0.03em] text-ink">{c.title}</span>
                  <ArrowUpRight className="h-5 w-5 text-ink transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </div>
              </>
            );
            return c.href ? (
              <Link key={c.n} href={c.href} data-drop style={d(220 + i * 90)} className="group w-[62vw] shrink-0 sm:w-auto">
                {body}
              </Link>
            ) : (
              <div key={c.n} data-drop style={d(220 + i * 90)} className="group w-[62vw] shrink-0 sm:w-auto">
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────── 3 · Noturno ───────────────────────────────
export function HeroNight(p: HeroProps) {
  const head = p.lines.slice(0, -1);
  const last = p.lines.at(-1) ?? "";
  const wa = waLink(p.whatsapp);
  return (
    <section className="px-3 pt-3 sm:px-4">
      <div className="relative isolate mx-auto max-w-[1440px] overflow-hidden rounded-[2rem] bg-[#07070b] text-white sm:rounded-[2.5rem]">
        <div aria-hidden className="stars absolute inset-0 -z-10" />
        <div aria-hidden className="blob absolute -right-[10%] -top-[30%] -z-10 h-[620px] w-[620px] rounded-full bg-accent opacity-40 blur-[120px]" />
        <div aria-hidden className="blob absolute -bottom-[35%] -left-[10%] -z-10 h-[520px] w-[520px] rounded-full bg-[#5b5bf0] opacity-30 blur-[120px] [animation-delay:-12s]" />

        <div className="grid items-center gap-12 px-5 py-10 sm:px-12 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:py-16">
          <div>
            <span data-enter className="glass-dark inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ring-1 ring-white/15">
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" aria-hidden /> {p.name}
            </span>
            <h1 data-enter style={d(80)} className="mt-6 text-[clamp(2.6rem,5.2vw,5rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
              {head.map((l, i) => (
                <span key={i} className="block">
                  {l}
                </span>
              ))}
              <span className="block bg-gradient-to-r from-accent via-[color-mix(in_oklab,var(--color-accent)_55%,white)] to-white bg-clip-text text-transparent">{last}</span>
            </h1>
            <p data-enter style={d(140)} className="mt-5 max-w-lg text-[16px] leading-relaxed text-white/65">
              {p.subtitle}
            </p>
            <div data-enter style={d(200)} className="mt-8 rounded-[1.5rem] bg-white p-4 text-ink shadow-[0_40px_120px_-30px_color-mix(in_oklab,var(--color-accent)_45%,transparent)] sm:p-6">
              {p.tabsCard.length > 0 && <SearchTabs tabs={p.tabsCard} variant="underline" />}
            </div>
            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-white/60">
              {trustLine(p).map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4 text-accent" aria-hidden /> {t}
                </span>
              ))}
            </p>
          </div>

          {/* fotos flutuando em 3D */}
          <div className="relative hidden h-[560px] [perspective:1400px] lg:block">
            <div data-drop style={d(200)} className="absolute right-4 top-2 h-[400px] w-[300px] [transform:rotateY(-14deg)_rotateX(6deg)] [transform-style:preserve-3d]">
              <div data-bob className="h-full w-full overflow-hidden rounded-[1.75rem] shadow-[0_50px_100px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/15">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" className="h-full w-full object-cover" />
              </div>
            </div>
            <div data-drop style={d(340)} className="absolute bottom-8 left-0 h-[250px] w-[220px] [transform:rotateY(16deg)_rotateX(-4deg)]">
              <div data-bob style={d(900)} className="h-full w-full overflow-hidden rounded-[1.5rem] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/15">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image2} alt="" className="h-full w-full object-cover" />
              </div>
            </div>
            <div data-drop style={d(480)} className="glass-dark absolute left-[30%] top-[38%] rounded-2xl px-5 py-4 ring-1 ring-white/15">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Pague em até</span>
              <span className="block text-[1.9rem] font-semibold leading-none tracking-[-0.04em]">
                {p.maxInstallments}x <span className="text-accent">sem juros</span>
              </span>
            </div>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" data-drop style={d(620)} className="glass-dark group absolute bottom-0 right-6 flex items-center gap-3 rounded-2xl py-3 pl-3 pr-4 ring-1 ring-white/15 transition hover:ring-white/30">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-fg">
                  <MessageCircle className="h-5 w-5" aria-hidden />
                </span>
                <span className="leading-tight">
                  <span className="block text-[12px] text-white/55">Dúvidas sobre a viagem?</span>
                  <span className="flex items-center gap-1 text-[14px] font-semibold">
                    Fale com a {p.name} <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </span>
                </span>
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────── 4 · Centrado ───────────────────────────────
export function HeroCentered(p: HeroProps) {
  const head = p.lines.slice(0, -1);
  const last = p.lines.at(-1) ?? "";
  const cards = [
    { src: p.image, label: p.name },
    { src: photo("colosseum", 500, 680), label: "Roma" },
    { src: photo("eiffel", 500, 680), label: "Paris" },
    { src: photo("lisbon", 500, 680), label: "Lisboa" },
    { src: p.image2, label: "Sua próxima viagem" },
  ];
  return (
    <section className="relative isolate overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 bg-gradient-to-b from-brand-50 to-white" />
      <div aria-hidden className="blob pointer-events-none absolute -left-40 top-10 -z-10 h-[420px] w-[420px] rounded-full bg-brand-200 opacity-50 blur-[100px]" />
      <div aria-hidden className="blob pointer-events-none absolute -right-40 top-40 -z-10 h-[420px] w-[420px] rounded-full bg-[#a5b4fc] opacity-40 blur-[100px] [animation-delay:-10s]" />

      <div className="mx-auto max-w-[1100px] px-4 pt-12 text-center sm:px-8 sm:pt-16">
        <span data-enter className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink shadow-sm ring-1 ring-black/[0.05]">
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden /> {p.name}
        </span>
        <h1 data-enter style={d(80)} className="mx-auto mt-6 max-w-4xl text-[clamp(2.6rem,6.5vw,5.75rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-ink">
          {head.join(" ")} <span className="text-accent-ink">{last}</span>
        </h1>
        <p data-enter style={d(140)} className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-muted">
          {p.subtitle}
        </p>
        <div data-enter style={d(200)} className="mx-auto mt-9 max-w-[1040px] text-left">
          {p.tabsBar.length > 0 && <SearchTabs tabs={p.tabsBar} tone="light" center />}
        </div>
        <div data-enter style={d(260)} className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {p.shortcuts.map((s) => (
            <Link key={s.href} href={s.href} className="group inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[14px] font-semibold text-ink shadow-sm ring-1 ring-black/[0.06] transition hover:-translate-y-0.5 hover:shadow-md">
              <s.icon className="h-4 w-4 text-accent-ink" aria-hidden /> {s.label}
              <ArrowRight className="h-3.5 w-3.5 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
            </Link>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-muted">{trustLine(p).join(" · ")}</p>
      </div>

      {/* destinos em degraus */}
      <div className="no-scrollbar mx-auto mt-12 flex max-w-[1300px] snap-x items-end justify-start gap-4 overflow-x-auto px-4 pb-6 sm:justify-center sm:px-8">
        {cards.map((c, i) => (
          <div
            key={i}
            data-drop
            style={d(300 + i * 80)}
            className={cn(
              "group relative w-[180px] shrink-0 snap-center overflow-hidden rounded-[1.75rem] bg-surface shadow-[0_30px_60px_-35px_rgba(0,0,0,0.55)] sm:w-[220px]",
              ["h-[230px] sm:h-[280px]", "h-[270px] sm:h-[330px]", "h-[300px] sm:h-[370px]", "h-[270px] sm:h-[330px]", "h-[230px] sm:h-[280px]"][i],
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.src} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <span className="absolute bottom-4 left-4 right-4 text-left text-[15px] font-semibold text-white">{c.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
