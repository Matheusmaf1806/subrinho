import { monogram } from "@/lib/theme";
import { cn } from "@/components/ui";
import type { Store } from "../_lib/store";

/** Logo da agência; sem logo, monograma com as iniciais na cor da marca (nunca a marca Subrinho). */
export function StoreMark({ store, className, onDark }: { store: Pick<Store, "name" | "logoUrl" | "logoOnDarkUrl">; className?: string; onDark?: boolean }) {
  const src = onDark ? store.logoOnDarkUrl : store.logoUrl;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={store.name} className={cn("h-10 w-auto max-w-[180px] object-contain", className)} />;
  }
  return (
    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[30%] bg-brand text-[15px] font-semibold tracking-[-0.04em] text-brand-fg", className)} aria-hidden>
      {monogram(store.name)}
    </span>
  );
}
