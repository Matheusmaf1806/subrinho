import type { Category } from "@/server/db/schema";
import { cn } from "@/components/ui";
import { CATEGORY_PHOTO, photo } from "@/lib/images";
import { categoryIcon } from "./category";

/** Foto do produto (ou foto padrão da categoria). Recorta para preencher o contêiner. */
export function Cover({
  title,
  location,
  category,
  imageUrl,
  className,
  big,
  rounded = "rounded-3xl",
  overlay,
}: {
  title: string;
  location?: string | null;
  category: Category;
  imageUrl?: string | null;
  className?: string;
  big?: boolean;
  rounded?: string;
  overlay?: React.ReactNode;
}) {
  const src = imageUrl ?? photo(CATEGORY_PHOTO[category] ?? "colosseum", big ? 1600 : 900);
  const Icon = categoryIcon(category);
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", rounded, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={title} loading={big ? "eager" : "lazy"} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
      {location && (
        <span className={cn("absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 font-semibold text-ink backdrop-blur", big ? "text-sm" : "text-xs")}>
          <Icon className="h-3.5 w-3.5 text-accent-ink" /> {location}
        </span>
      )}
      {overlay}
    </div>
  );
}
