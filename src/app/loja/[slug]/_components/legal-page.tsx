import type { LegalDoc } from "@/lib/legal";
import { LEGAL_UPDATED_AT } from "@/lib/legal";

/** Página de texto legal da loja (termos, privacidade, cancelamento). */
export function LegalPage({ doc, base }: { doc: LegalDoc; base: string }) {
  const links = [
    { href: `${base}/termos`, label: "Termos de uso" },
    { href: `${base}/privacidade`, label: "Privacidade" },
    { href: `${base}/cancelamento`, label: "Cancelamento e reembolso" },
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <nav aria-label="Políticas da loja" className="no-scrollbar mb-8 flex gap-2 overflow-x-auto">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="whitespace-nowrap rounded-full bg-surface px-4 py-2 text-[13px] font-semibold text-ink hover:bg-surface-2">
            {l.label}
          </a>
        ))}
      </nav>
      <h1 className="display text-[clamp(2.25rem,5vw,3.5rem)] text-ink">{doc.title}</h1>
      <p className="mt-2 text-[13px] text-muted">Atualizado em {LEGAL_UPDATED_AT}</p>
      <p className="mt-6 text-[17px] leading-relaxed text-ink">{doc.intro}</p>
      <div className="mt-10 space-y-9">
        {doc.sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-xl font-semibold text-ink">{s.title}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-3 text-[15px] leading-relaxed text-ink/80">
                {p}
              </p>
            ))}
            {s.list && (
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink/80">
                {s.list.map((li, i) => (
                  <li key={i}>{li}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
