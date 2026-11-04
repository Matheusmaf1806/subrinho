/** Enquanto os fornecedores respondem (2–5 s em destinos grandes). */
export default function LoadingHotels() {
  return (
    <main aria-busy="true" aria-live="polite">
      <section className="px-3 pt-3 sm:px-4">
        <div className="mx-auto max-w-[1440px] rounded-[2rem] bg-accent px-6 pb-28 pt-12 text-accent-fg sm:rounded-[2.5rem] sm:px-12 sm:pt-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-fg/70">Hospedagem</p>
          <p className="display mt-4 text-[clamp(2.25rem,5vw,4.5rem)]">Buscando os melhores preços…</p>
          <p className="mt-4 max-w-xl text-[17px] text-accent-fg/85">Estamos consultando os fornecedores em tempo real. Leva só alguns segundos.</p>
        </div>
      </section>
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-12 sm:px-8">
        <div className="mb-8 h-4 w-72 animate-pulse rounded-full bg-surface-2" />
        <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-3">
              <div className="aspect-[4/3] animate-pulse rounded-3xl bg-surface-2" />
              <div className="h-4 w-3/4 animate-pulse rounded-full bg-surface-2" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-2" />
              <div className="h-5 w-1/3 animate-pulse rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
