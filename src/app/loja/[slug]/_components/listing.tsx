import type { ReactNode } from "react";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui";

export function ListingHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <section className="bg-accent text-white">
      <div className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-white/85">{subtitle}</p>}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </section>
  );
}

export function NoResults({ what }: { what: string }) {
  return <EmptyState icon={<SearchX className="h-10 w-10" />} title={`Nenhum ${what} encontrado`} description="Tente outro destino ou outras datas." />;
}
