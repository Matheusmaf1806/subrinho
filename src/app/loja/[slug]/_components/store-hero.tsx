/**
 * Topo da página inicial — a busca é a protagonista: título curto da agência, cartão de busca com
 * abas por produto e, ao lado, as fotos da agência em formas na cor da marca. No celular o cartão
 * fica sobre a foto principal. Cores, fotos e título vêm da identidade de cada agência.
 */
import { ArrowUpRight, BadgeCheck, MessageCircle } from "lucide-react";
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
}) {
  const wa = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : null;
  const note = [`Até ${maxInstallments}x sem juros`, pixAvailable ? "desconto no Pix" : null, "preço e disponibilidade confirmados antes de pagar"].filter(Boolean).join(" · ");

  return (
    <section className="relative isolate overflow-x-clip">
      {/* celular: foto da agência atrás do cartão */}
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[300px] lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/10" />
      </div>
      {/* desktop: formas na cor da agência à direita */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)] lg:block">
        <div className="absolute -right-48 -top-56 h-[880px] w-[880px] rounded-full bg-brand-50" />
        <div className="absolute -right-24 top-24 h-[560px] w-[560px] rounded-full bg-brand-100" />
      </div>

      <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-4 pb-4 pt-8 sm:px-8 lg:grid-cols-[minmax(0,700px)_minmax(0,1fr)] lg:gap-14 lg:pb-6 lg:pt-10">
        <div>
          <h1 className="max-w-[20ch] text-[clamp(1.9rem,3.4vw,3.1rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-white drop-shadow-sm lg:max-w-none lg:text-ink lg:drop-shadow-none">
            {lines.map((l, i) => (
              <span key={i} className={cn(lines.length > 1 && i === lines.length - 1 && "lg:text-accent-ink")}>
                {i > 0 && " "}
                {l}
              </span>
            ))}
          </h1>
          {subtitle && <p className="mt-3 hidden max-w-xl text-[16px] leading-relaxed text-muted lg:block">{subtitle}</p>}

          <div className="mt-6 rounded-[1.75rem] bg-white p-4 shadow-[0_30px_80px_-35px_rgba(10,10,11,0.45)] ring-1 ring-black/[0.06] sm:p-6">
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

        {/* fotos da agência (desktop) */}
        <div className="relative hidden h-[540px] lg:block">
          <div className="absolute right-6 top-0 h-[520px] w-[400px] overflow-hidden rounded-b-[2.5rem] rounded-t-[200px] bg-surface shadow-[0_40px_80px_-40px_rgba(0,0,0,0.5)] ring-8 ring-white xl:right-14">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="h-full w-full object-cover" fetchPriority="high" />
          </div>
          <div className="absolute bottom-6 left-2 h-[190px] w-[190px] overflow-hidden rounded-full bg-surface shadow-[0_30px_60px_-25px_rgba(0,0,0,0.5)] ring-8 ring-white xl:left-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image2} alt="" className="h-full w-full object-cover" />
          </div>
          <span className="absolute left-6 top-16 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-semibold text-white shadow-lg xl:left-16">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden /> {maxInstallments}x sem juros em tudo
          </span>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="group absolute bottom-16 right-0 flex items-center gap-3 rounded-2xl bg-white py-3 pl-3 pr-4 shadow-[0_20px_40px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.05] transition hover:-translate-y-0.5 xl:right-4"
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
  );
}
