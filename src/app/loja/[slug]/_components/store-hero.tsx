/**
 * Topo da página inicial da loja: nome e título da agência, fotos (editáveis no editor de marca),
 * garantias reais da compra e a busca. Fundo claro com um toque da cor da agência — funciona com
 * qualquer cor e com fotos verticais ou horizontais.
 */
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, CreditCard, Headphones, MessageCircle, QrCode } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { SearchTabs } from "./search-tabs";

type Tab = { key: string; label: string; icon: ReactNode; content: ReactNode };

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
  popular,
}: {
  name: string;
  lines: string[];
  subtitle: string;
  image: string;
  image2: string;
  tabs: Tab[];
  pixAvailable: boolean;
  maxInstallments: number;
  whatsapp: string | null;
  popular: { name: string; href: string }[];
}) {
  const trust = [
    { icon: CreditCard, text: `Até ${maxInstallments}x sem juros` },
    ...(pixAvailable ? [{ icon: QrCode, text: "Desconto no Pix" }] : []),
    { icon: BadgeCheck, text: "Preço confirmado na hora" },
    { icon: Headphones, text: "Atendimento humano" },
  ];
  const wa = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : null;

  return (
    <section className="relative isolate">
      {/* um toque da cor da agência atrás do topo, sumindo no branco */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-gradient-to-b from-brand-50 via-brand-50/50 to-white lg:h-[640px]" />
      <div className="mx-auto max-w-[1440px] px-4 pt-6 sm:px-8 sm:pt-10 lg:pt-12">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-16">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05]">
              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden /> {name}
            </span>
            <h1 className="display mt-5 text-[clamp(2.75rem,6vw,5.5rem)] text-ink sm:mt-6">
              {lines.map((l, i) => (
                <span key={i} className={cn("block", lines.length > 1 && i === lines.length - 1 && "text-accent-ink")}>
                  {l}
                </span>
              ))}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted sm:mt-6 sm:text-lg">{subtitle}</p>
            <ul className="mt-8 hidden max-w-[34rem] grid-cols-2 gap-x-6 gap-y-3 sm:grid">
              {trust.map((t) => (
                <li key={t.text} className="flex items-center gap-2.5 text-[14px] font-semibold leading-tight text-ink">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-accent-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.05]">
                    <t.icon className="h-4 w-4" aria-hidden />
                  </span>
                  {t.text}
                </li>
              ))}
            </ul>
          </div>

          {/* fotos: principal grande + secundária sobreposta (só no desktop) */}
          <div className="relative hidden h-[500px] lg:block">
            <div className="absolute inset-y-0 left-[16%] right-0 overflow-hidden rounded-[2.5rem] bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="h-full w-full object-cover" fetchPriority="high" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
            </div>
            <div className="absolute bottom-12 left-0 aspect-[4/5] w-[34%] overflow-hidden rounded-[1.75rem] bg-surface shadow-[0_30px_60px_-25px_rgba(0,0,0,0.45)] ring-[6px] ring-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image2} alt="" className="h-full w-full object-cover" />
            </div>
            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="group absolute bottom-6 right-6 flex items-center gap-3 rounded-2xl bg-white/95 py-3 pl-3 pr-4 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)] backdrop-blur transition hover:bg-white"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-fg">
                  <MessageCircle className="h-5 w-5" aria-hidden />
                </span>
                <span className="leading-tight">
                  <span className="block text-[13px] text-muted">Dúvidas sobre a viagem?</span>
                  <span className="flex items-center gap-1 text-[15px] font-semibold text-ink">
                    Fale com a {name} <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </a>
            ) : (
              <div className="absolute bottom-6 right-6 rounded-2xl bg-white/95 px-4 py-3 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)] backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Pague em até</p>
                <p className="mt-1 text-[1.75rem] font-semibold leading-none tracking-[-0.04em] text-ink">
                  {maxInstallments}x <span className="text-[15px] tracking-normal text-accent-ink">sem juros</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {tabs.length > 0 && (
          <div className="mt-7 sm:mt-10">
            <SearchTabs tabs={tabs} tone="light" />
          </div>
        )}
        {popular.length > 0 && (
          <div className="no-scrollbar -mx-4 mt-5 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <span className="mr-1 shrink-0 text-[13px] font-semibold text-muted">Populares</span>
            {popular.map((p) => (
              <Link key={p.name} href={p.href} className="shrink-0 rounded-full bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink transition hover:bg-surface-2">
                {p.name}
              </Link>
            ))}
          </div>
        )}
        {/* celular: garantias depois da busca, numa fileira */}
        <ul className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 sm:hidden">
          {trust.map((t) => (
            <li key={t.text} className="flex shrink-0 items-center gap-2 rounded-full bg-white py-2 pl-2 pr-3.5 text-[13px] font-semibold text-ink ring-1 ring-black/[0.06]">
              <t.icon className="h-4 w-4 text-accent-ink" aria-hidden />
              {t.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
