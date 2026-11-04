/** Enquanto a disponibilidade e as fotos do hotel chegam do fornecedor. */
export default function LoadingHotel() {
  return (
    <main aria-busy="true" aria-live="polite" className="mx-auto max-w-[1440px] space-y-10 px-4 py-8 sm:px-8">
      <div className="h-9 w-40 animate-pulse rounded-full bg-surface-2" />
      <div className="space-y-3">
        <div className="h-4 w-64 animate-pulse rounded-full bg-surface-2" />
        <div className="h-14 w-2/3 animate-pulse rounded-2xl bg-surface-2" />
        <p className="text-[15px] text-muted">Consultando quartos e preços no fornecedor…</p>
      </div>
      <div className="grid h-[300px] grid-cols-3 grid-rows-2 gap-3 sm:h-[460px]">
        <div className="col-span-2 row-span-2 animate-pulse rounded-[2rem] bg-surface-2" />
        <div className="animate-pulse rounded-[1.5rem] bg-surface-2" />
        <div className="animate-pulse rounded-[1.5rem] bg-surface-2" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-[2rem] bg-surface-2" />
        ))}
      </div>
    </main>
  );
}
