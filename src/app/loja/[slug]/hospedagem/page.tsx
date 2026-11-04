import Link from "next/link";
import { db } from "@/server/db";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { POPULAR_DESTINATIONS } from "@/server/suppliers/hotels/popular";
import { SupplierError } from "@/server/suppliers/types";
import { Alert, ButtonLink } from "@/components/ui";
import { date, paxSummary } from "@/lib/format";
import { daysBetween } from "@/lib/tz";
import { getStore, getStorePricing } from "../_lib/store";
import { LodgingSearch } from "../_components/search-forms";
import { lodgingQuery, parseSearch, supplierParams } from "../_components/search-params";
import { ListingHeader, NoResults } from "../_components/listing";
import { ProductCard } from "../_components/product-card";

export const metadata = { title: "Hospedagem" };
// Busca em vários fornecedores em paralelo (a GGT pode levar até ~15 s em destinos grandes).
export const maxDuration = 60;

const PAGE_SIZE = 24;

export default async function LodgingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const store = await getStore((await params).slug);
  const ctx = await getStorePricing(store.id);
  const raw = await searchParams;
  const { d, minDate } = parseSearch(raw);
  const base = `/loja/${store.slug}/hospedagem`;
  const live = adaptersFor("LODGING").some((a) => a.live);
  const searched = !!(d.destino || d.dest);
  const failures: { code: string; message: string | null }[] = [];
  const results =
    searched || !live
      ? await searchCatalog(db, ctx, "LODGING", supplierParams(d, "lodging"), {
          onError: (code, e) => failures.push({ code, message: e instanceof SupplierError && !("detail" in e) ? e.message : null }),
        })
      : [];
  const nights = daysBetween(d.checkin, d.checkout);
  const q = lodgingQuery(d);
  const destinations = [...new Set(adaptersFor("LODGING").flatMap((a) => a.destinations().map((x) => x.name)))];
  const note = `${nights} noite${nights > 1 ? "s" : ""} · ${paxSummary({ rooms: d.quartos, adults: d.adultos, children: d.criancas })}`;
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(raw.pagina) || 1));
  const shown = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const userMessage = failures.find((f) => f.message)?.message;

  return (
    <main>
      <ListingHeader eyebrow="Hospedagem" image="palmPool" title="Hotéis no mundo todo." subtitle="Comparamos vários fornecedores e mostramos o melhor preço para a sua estadia.">
        <LodgingSearch action={base} d={d} destinations={destinations} minDate={minDate} />
      </ListingHeader>
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-12 sm:px-8">
        {!searched && live ? (
          <section>
            <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.04em] text-ink">Para onde você vai?</h2>
            <p className="mt-2 text-[15px] text-muted">Digite a cidade no campo de destino ou escolha um dos mais procurados.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {POPULAR_DESTINATIONS.slice(0, 18).map((p) => (
                <Link
                  key={p.id}
                  href={`${base}?${lodgingQuery(d, { destino: p.label, dest: `p:${p.id}` })}`}
                  className="rounded-full bg-surface px-4 py-2.5 text-[14px] font-semibold text-ink transition hover:bg-ink hover:text-white"
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <>
            <p className="mb-8 text-[15px] text-muted">
              {results.length} {results.length === 1 ? "hotel" : "hotéis"}
              {d.destino ? ` em “${d.destino}”` : ""} · {date(d.checkin)} a {date(d.checkout)} · {note}
              {pages > 1 ? ` · página ${page} de ${pages}` : ""}
            </p>
            {failures.length > 0 && results.length > 0 && <Alert tone="info" className="mb-8">Um dos fornecedores não respondeu agora — mostrando as ofertas dos demais.</Alert>}
            {results.length === 0 ? (
              failures.length > 0 && !userMessage ? (
                <Alert tone="warning">Não conseguimos consultar os hotéis agora. Tente novamente em instantes.</Alert>
              ) : userMessage ? (
                <Alert tone="warning">{userMessage}</Alert>
              ) : (
                <NoResults what="hotel" />
              )
            ) : (
              <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shown.map((p) => (
                  <ProductCard key={`${p.supplierCode}-${p.productId}`} p={p} href={`${base}/${p.supplierCode}/${p.productId}?${q}`} note={`total da estadia · ${note}`} />
                ))}
              </div>
            )}
            {pages > 1 && (
              <nav className="mt-14 flex items-center justify-center gap-2" aria-label="Páginas">
                {page > 1 && (
                  <ButtonLink href={`${base}?${lodgingQuery(d)}&pagina=${page - 1}`} variant="outline">
                    ← Anterior
                  </ButtonLink>
                )}
                <span className="px-3 text-[14px] font-semibold text-muted tabular">
                  {page} / {pages}
                </span>
                {page < pages && (
                  <ButtonLink href={`${base}?${lodgingQuery(d)}&pagina=${page + 1}`} variant="outline">
                    Próxima →
                  </ButtonLink>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </main>
  );
}
