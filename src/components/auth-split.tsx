import type { ReactNode } from "react";
import { FlightPath, SubrinhoLogo, SubrinhoSymbol } from "./brand";
import { cn } from "./ui";

/** Tela de login dos painéis: formulário à esquerda, bloco de marca (cor chapada + foto) à direita. */
export function AuthSplit({
  label,
  title,
  description,
  children,
  footnote,
  image,
  tone = "brand",
  blockTitle,
}: {
  label: string;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  footnote?: ReactNode;
  image?: string;
  tone?: "brand" | "dark";
  blockTitle: ReactNode;
}) {
  return (
    <div className="grid min-h-screen gap-3 bg-white p-3 lg:grid-cols-[1fr_1.05fr]">
      <section className="flex flex-col justify-between px-4 py-6 sm:px-10 lg:px-16 lg:py-10">
        <SubrinhoLogo size="md" />
        <div className="my-14 w-full max-w-md">
          <span className="inline-flex rounded-full bg-surface px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
          <h1 className="display mt-6 text-[clamp(2.75rem,5vw,4.5rem)] text-ink">{title}</h1>
          <p className="mt-4 text-[17px] text-muted">{description}</p>
          <div className="mt-10">{children}</div>
        </div>
        <p className="text-[13px] text-muted">{footnote}</p>
      </section>
      <section className={cn("relative hidden overflow-hidden rounded-[2.5rem] lg:block", tone === "dark" ? "bg-ink" : "bg-brand")}>
        {image && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          </>
        )}
        {!image && <SubrinhoSymbol className="absolute -right-24 -top-16 h-[115%] w-auto text-white/[0.06]" />}
        <FlightPath className="absolute right-10 top-10 h-28 w-56 text-white/50" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white xl:p-16">
          <p className="display text-[clamp(3rem,5.2vw,5.5rem)]">{blockTitle}</p>
        </div>
      </section>
    </div>
  );
}
