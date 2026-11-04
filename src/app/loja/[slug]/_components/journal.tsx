/**
 * Elementos do "diário de viagem" usados na loja: traço à mão, título de seção com marcação,
 * carimbo do correio. Tudo em `currentColor` / tokens da marca (cada agência com a sua cor).
 */
import type { ReactNode } from "react";
import { ButtonLink, cn } from "@/components/ui";

/** Traço feito à mão (sublinhado). */
export function Scribble({ className, draw }: { className?: string; draw?: boolean }) {
  return (
    <svg viewBox="0 0 400 24" preserveAspectRatio="none" className={className} aria-hidden>
      <path d="M4 15 C 70 4, 150 3, 214 9 S 330 21, 396 8" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" className={draw ? "draw-path" : undefined} style={draw ? ({ "--len": 420 } as React.CSSProperties) : undefined} />
      <path d="M40 20 C 120 13, 230 13, 330 18" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity=".55" className={draw ? "draw-path" : undefined} style={draw ? ({ "--len": 320, "--d": "650ms" } as React.CSSProperties) : undefined} />
    </svg>
  );
}

/** Texto com o trecho `mark` sublinhado à mão e na cor da marca. */
export function Marked({ text, mark }: { text: string; mark?: string }) {
  if (!mark || !text.includes(mark)) return <>{text}</>;
  const [a, b] = [text.slice(0, text.indexOf(mark)), text.slice(text.indexOf(mark) + mark.length)];
  return (
    <>
      {a}
      <span className="relative inline-block whitespace-nowrap text-accent-ink">
        {mark}
        <Scribble className="absolute -bottom-1.5 left-0 h-2.5 w-full text-accent sm:-bottom-2 sm:h-3" />
      </span>
      {b}
    </>
  );
}

/** Título de seção: etiqueta + título grande (com marcação) + link "ver todos". */
export function SectionTitle({ eyebrow, title, mark, href, cta = "Ver todos", className }: { eyebrow?: ReactNode; title: string; mark?: string; href?: string; cta?: string; className?: string }) {
  return (
    <div className={cn("mb-9 flex flex-wrap items-end justify-between gap-4", className)} data-reveal>
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> {eyebrow}
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

/** Carimbo do correio com texto em volta (nome da agência). */
export function Postmark({ ring, center, sub, waves = true, className }: { ring: string; center: string; sub?: string; waves?: boolean; className?: string }) {
  const id = `pm-${ring.replace(/[^a-z0-9]/gi, "").slice(0, 12)}-${center.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={waves ? "0 0 260 140" : "0 0 140 140"} className={className} aria-hidden>
      <defs>
        <path id={id} d="M70,70 m-50,0 a50,50 0 1,1 100,0 a50,50 0 1,1 -100,0" />
      </defs>
      <circle cx="70" cy="70" r="64" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="70" cy="70" r="38" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text fontSize="11.5" fontWeight="700" fill="currentColor" letterSpacing="1">
        <textPath href={`#${id}`} textLength="312" lengthAdjust="spacingAndGlyphs">
          {ring}
        </textPath>
      </text>
      <text x="70" y={sub ? 70 : 76} textAnchor="middle" fontSize={center.length > 5 ? 13 : 18} fontWeight="800" fill="currentColor">
        {center}
      </text>
      {sub && (
        <text x="70" y="85" textAnchor="middle" fontSize="8" fontWeight="700" letterSpacing="2" fill="currentColor">
          {sub}
        </text>
      )}
      {waves &&
        [0, 1, 2, 3].map((i) => <path key={i} d={`M140 ${44 + i * 17} q 15 -9 30 0 t 30 0 t 30 0 t 30 0`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />)}
    </svg>
  );
}
