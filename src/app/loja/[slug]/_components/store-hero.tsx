/**
 * Topo da página inicial: só o banner — fotos de destino trocando sozinhas (com zoom lento), sem
 * texto por cima — e a busca flutuando na base do banner. O título da agência fica no código para
 * leitores de tela e buscadores. Cores da busca seguem a marca de cada agência.
 */
import { BadgeCheck } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { photo, type PhotoKey } from "@/lib/images";
import { SearchTabs } from "./search-tabs";

type Tab = { key: string; label: string; icon: ReactNode; content: ReactNode };

/** Fotos do banner (trocam a cada 6 s; o ciclo de 24 s está em `.slide` no globals.css). */
const SLIDES: PhotoKey[] = ["vernazza", "colosseum", "eiffel", "lisbon"];
const delay = (i: number) => ({ "--slide-delay": `${i * 6}s` }) as CSSProperties;

export function StoreHero({ name, lines, tabs, pixAvailable, maxInstallments }: { name: string; lines: string[]; tabs: Tab[]; pixAvailable: boolean; maxInstallments: number }) {
  const trust = [`Até ${maxInstallments}x sem juros`, pixAvailable ? "desconto no Pix" : null, "preço confirmado antes de pagar"].filter((t): t is string => !!t);
  return (
    <section className="px-3 pt-3 sm:px-4">
      {/* título só para leitores de tela e buscadores; o banner fica limpo */}
      <h1 className="sr-only">
        {name}: {lines.join(" ")}
      </h1>
      <div className="relative isolate mx-auto h-[340px] max-w-[1440px] overflow-hidden rounded-[2rem] bg-ink sm:h-[460px] sm:rounded-[2.5rem] lg:h-[min(62vh,580px)] lg:min-h-[480px]">
        {SLIDES.map((key, i) => (
          <div key={key} className="slide absolute inset-0 -z-20" style={delay(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo(key, 2400, 1100)} alt="" className="h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} />
          </div>
        ))}
        {/* sombra só na base, para as abas da busca ficarem legíveis */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
        {/* andamento do banner (uma barrinha por foto) */}
        <div aria-hidden className="absolute right-5 top-5 flex gap-1.5 sm:right-8 sm:top-7">
          {SLIDES.map((key, i) => (
            <span key={key} className="slide-bar h-1 w-8 overflow-hidden rounded-full bg-white/35 sm:w-10" style={delay(i)}>
              <span className="block h-full w-full rounded-full bg-white" />
            </span>
          ))}
        </div>
      </div>

      {/* busca flutuando sobre a base do banner */}
      <div data-enter style={{ "--d": "120ms" } as CSSProperties} className="relative z-10 mx-auto -mt-28 max-w-[1240px] px-3 sm:-mt-32 sm:px-10">
        {tabs.length > 0 ? (
          <SearchTabs tabs={tabs} />
        ) : (
          <p className="rounded-[1.75rem] bg-white px-6 py-8 text-center text-[15px] text-muted shadow-[0_30px_80px_-40px_rgba(10,10,11,0.45)] ring-1 ring-inset ring-black/[0.06]">Em breve, produtos para a sua viagem.</p>
        )}
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[13px] text-muted">
          {trust.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-4 w-4 text-accent-ink" aria-hidden /> {t}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
