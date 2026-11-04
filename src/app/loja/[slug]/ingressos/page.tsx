import { db } from "@/server/db";
import { productRef } from "@/server/suppliers/refs";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { SupplierError } from "@/server/suppliers/types";
import { Alert, ButtonLink } from "@/components/ui";
import { categoryAvailable } from "../_lib/categories";
import { ComingSoon } from "../_components/coming-soon";
import { getStore, getStorePricing } from "../_lib/store";
import { storeInsight } from "../_lib/insight";
import { TicketsSearch } from "../_components/search-forms";
import { parseSearch, supplierParams, toQuery } from "../_components/search-params";
import { ListingHeader, NoResults } from "../_components/listing";
import { ProductCard } from "../_components/product-card";
import { MobileSearchToggle } from "../_components/search-toggle";
import { date } from "@/lib/format";

export const metadata = { title: "Ingressos e Experiências" };
// Catálogo do fornecedor (cache de horas) + preço da temporada da data escolhida.
export const maxDuration = 60;

const PAGE_SIZE = 24;

export default async function TicketsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const store = await getStore((await params).slug);
  // categoria sem fornecedor com API real: nada de catálogo de exemplo
  if (!(await categoryAvailable("TICKETS"))) return <ComingSoon title="Ingressos" base={`/loja/${store.slug}`} />;
  const ctx = await getStorePricing(store.id);
  const reveal = await storeInsight(store.id);
  const raw = await searchParams;
  const { d, minDate } = parseSearch(raw);
  const failures: { message: string | null }[] = [];
  const results = await searchCatalog(db, ctx, "TICKETS", supplierParams(d, "tickets"), {
      reveal,
    onError: (_code, e) => failures.push({ message: e instanceof SupplierError && !("detail" in e) ? e.message : null }),
  });
  const base = `/loja/${store.slug}/ingressos`;
  const q = toQuery({ destino: d.destino, data: d.data, adultos: d.adultos, criancas: d.criancas });
  const destinations = [...new Set(adaptersFor("TICKETS").flatMap((a) => a.destinations().map((x) => x.name)))];
  const searched = !!(raw.destino || raw.data);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(raw.pagina) || 1));
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const userMessage = failures.find((f) => f.message)?.message;
  const search = <TicketsSearch action={base} d={d} destinations={destinations} minDate={minDate} />;
  return (
    <main>
      {searched ? (
        <ListingHeader eyebrow="Ingressos e experiências" compact title={d.destino ? `Ingressos em ${d.destino.split(",")[0]}` : "Ingressos e experiências"}>
          <MobileSearchToggle summary={d.destino || "Ingressos"} detail={`visita em ${date(d.data)} · ${d.adultos + d.criancas} pessoa(s)`}>
            {search}
          </MobileSearchToggle>
        </ListingHeader>
      ) : (
        <ListingHeader eyebrow="Ingressos e experiências" image="colosseumArches" title="Ingressos sem fila." subtitle="Parques, museus e passeios com data marcada, no Pix ou em 10x sem juros.">
          {search}
        </ListingHeader>
      )}
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-8 sm:px-8 sm:pt-12">
        <p className="mb-8 text-[15px] text-muted">
          {results.length} {results.length === 1 ? "experiência" : "experiências"}
          {d.destino ? ` em “${d.destino}”` : ""} · visita em {date(d.data)} · preços por adulto
          {pages > 1 ? ` · página ${page} de ${pages}` : ""}
        </p>
        {results.length === 0 ? (
          failures.length > 0 && !userMessage ? (
            <Alert tone="warning">Não conseguimos consultar os ingressos agora. Tente novamente em instantes.</Alert>
          ) : userMessage ? (
            <Alert tone="warning">{userMessage}</Alert>
          ) : (
            <NoResults what="ingresso" />
          )
        ) : (
          <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => (
              <ProductCard key={productRef(p.supplierCode, p.productId)} p={p} href={`${base}/${productRef(p.supplierCode, p.productId)}?${q}`} note="por adulto" />
            ))}
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-14 flex items-center justify-center gap-2" aria-label="Páginas">
            {page > 1 && (
              <ButtonLink href={`${base}?${q}&pagina=${page - 1}`} variant="outline">
                ← Anterior
              </ButtonLink>
            )}
            <span className="px-3 text-[14px] font-semibold text-muted tabular">
              {page} / {pages}
            </span>
            {page < pages && (
              <ButtonLink href={`${base}?${q}&pagina=${page + 1}`} variant="outline">
                Próxima →
              </ButtonLink>
            )}
          </nav>
        )}
      </div>
    </main>
  );
}
