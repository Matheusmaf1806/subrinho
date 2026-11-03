import { SYMBOL_PATH, SYMBOL_VIEWBOX } from "./brand-path";

export function SubrinhoSymbol({ className, title = "Subrinho" }: { className?: string; title?: string }) {
  return (
    <svg viewBox={SYMBOL_VIEWBOX} className={className} role="img" aria-label={title}>
      <path fillRule="evenodd" fill="currentColor" d={SYMBOL_PATH} />
    </svg>
  );
}

/** Logo horizontal: símbolo + "Subrinho". `tone="light"` para fundo vermelho. */
export function SubrinhoLogo({ className = "", tone = "brand", size = "md" }: { className?: string; tone?: "brand" | "light" | "dark"; size?: "sm" | "md" | "lg" }) {
  const color = tone === "light" ? "text-white" : tone === "dark" ? "text-ink" : "text-brand";
  const s = size === "sm" ? "h-[22px] text-[1.35rem]" : size === "lg" ? "h-12 text-[3.25rem]" : "h-7 text-[1.75rem]";
  const [iconH, text] = s.split(" ");
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-[-0.05em] ${color} ${className}`}>
      <SubrinhoSymbol className={`${iconH} w-auto`} />
      <span className={`${text} leading-none`}>Subrinho</span>
    </span>
  );
}

/** Ícone do app: quadrado arredondado vermelho com o símbolo. */
export function SubrinhoAppIcon({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <span className={`inline-grid place-items-center rounded-[28%] bg-brand ${className}`}>
      <SubrinhoSymbol className="h-[58%] w-auto text-white" />
    </span>
  );
}

/** Avião + rota tracejada (elemento gráfico da marca). */
export function FlightPath({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 120" className={className} fill="none" aria-hidden>
      <path d="M4 112 C 60 110, 120 96, 160 60" stroke="currentColor" strokeWidth="2.5" strokeDasharray="7 7" strokeLinecap="round" />
      <path
        d="M196 20l-22 14-26-8-6 4 20 12-12 9-10-2-4 3 11 7 5 12 4-2-1-10 11-10 9 21 5-3-2-27 20-15c4-3 5-7 3-9s-6-1-9 1z"
        fill="currentColor"
      />
    </svg>
  );
}
