/**
 * Elementos visuais da loja: marca-texto retangular, título de seção com etiqueta e carimbo de
 * borracha retangular. Tudo em `currentColor` / tokens da marca (cada agência com a sua cor).
 */
import type { ReactNode } from "react";
import { ButtonLink, cn } from "@/components/ui";

/** Texto com o trecho `mark` em marca-texto retangular (cor da marca). */
export function Marked({ text, mark }: { text: string; mark?: string }) {
  if (!mark || !text.includes(mark)) return <>{text}</>;
  const [a, b] = [text.slice(0, text.indexOf(mark)), text.slice(text.indexOf(mark) + mark.length)];
  return (
    <>
      {a}
      <span className="marker whitespace-nowrap">{mark}</span>
      {b}
    </>
  );
}

/** Carimbo de borracha retangular (borda dupla, texto em caixa alta). */
export function RubberStamp({ top, main, bottom, className }: { top?: string; main: string; bottom?: string; className?: string }) {
  return (
    <span className={cn("inline-flex flex-col items-center rounded-[6px] border-[3px] border-current px-4 py-2 text-center uppercase leading-none outline outline-[1.5px] outline-offset-[3px] outline-current", className)} aria-hidden>
      {top && <span className="text-[10px] font-bold tracking-[0.22em]">{top}</span>}
      <span className="my-1 text-[1.9rem] font-extrabold tracking-[0.06em]">{main}</span>
      {bottom && <span className="text-[10px] font-bold tracking-[0.22em]">{bottom}</span>}
    </span>
  );
}

/** Título de seção: etiqueta + título grande (com marcação) + link "ver todos". */
export function SectionTitle({ eyebrow, title, mark, href, cta = "Ver todos", className }: { eyebrow?: ReactNode; title: string; mark?: string; href?: string; cta?: string; className?: string }) {
  return (
    <div className={cn("mb-9 flex flex-wrap items-end justify-between gap-4", className)} data-reveal>
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="mb-4 inline-flex items-center gap-2 rounded-md bg-brand-50 px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-ink ring-1 ring-inset ring-brand-100">
            <span className="h-2 w-2 bg-accent" aria-hidden /> {eyebrow}
          </p>
        )}
        <h2 className="text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink">
          <Marked text={title} mark={mark} />
        </h2>
      </div>
      {href && (
        <ButtonLink href={href} variant="outline" className="group shrink-0">
          {cta} <span className="transition group-hover:translate-x-1">→</span>
        </ButtonLink>
      )}
    </div>
  );
}
