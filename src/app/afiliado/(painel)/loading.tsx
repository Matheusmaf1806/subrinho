export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Carregando…</span>
      <div className="mb-6 h-8 w-56 rounded-xl bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-line bg-white" />
        ))}
      </div>
      <div className="mt-6 h-72 rounded-2xl border border-line bg-white" />
    </div>
  );
}
