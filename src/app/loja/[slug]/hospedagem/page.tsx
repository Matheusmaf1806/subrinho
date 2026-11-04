import Link from "next/link";
import { db } from "@/server/db";
import { productRef } from "@/server/suppliers/refs";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { POPULAR_DESTINATIONS } from "@/server/suppliers/hotels/popular";
import { SupplierError } from "@/server/suppliers/types";
import { Alert, ButtonLink } from "@/components/ui";
import { date, paxSummary } from "@/lib/format";
import { daysBetween } from "@/lib/tz";
import { categoryAvailable } from "../_lib/categories";
import { ComingSoon } from "../_components/coming-soon";
import { getStore, getStorePricing } from "../_lib/store";
import { LodgingSearch } from "../_components/search-forms";
import { lodgingQuery, parseSearch, supplierParams } from "../_components/search-params";
import { ListingHeader, NoResults } from "../_components/listing";
import { ProductCard } from "../_components/product-card";
import { MobileSearchToggle } from "../_components/search-toggle";

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "");

export const metadata = { title: "Hospedagem" };
// Busca em vários fornecedores em paralelo (a GGT pode levar até ~15 s em destinos grandes).
export const maxDuration = 60;

const PAGE_SIZE = 24;

type Filters = { ordem: "preco" | "preco-desc" | "estrelas"; estrelas: number; cafe: boolean; reembolsavel: boolean };

function parseFilters(raw: Record<string, string>): Filters {
  const ordem = raw.ordem === "preco-desc" || raw.ordem === "estrelas" ? raw.ordem : "preco";
  const estrelas = [3, 4, 5].includes(Number(raw.estrelas)) ? Number(raw.estrelas) : 0;
  return { ordem, estrelas, cafe: raw.cafe === "1", reembolsavel: raw.reembolsavel === "1" };
}

function filterQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.ordem !== "preco") p.set("ordem", f.ordem);
  if (f.estrelas) p.set("estrelas", String(f.estrelas));
  if (f.cafe) p.set("cafe", "1");
  if (f.reembolsavel) p.set("reembolsavel", "1");
  const q = p.toString();
  return q ? `&${q}` : "";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${active ? "bg-ink text-white" : "bg-surface text-ink hover:bg-surface-2"}`}
    >
      {children}
    </Link>
  );
}

export default async function LodgingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const store = await getStore((await params).slug);
  // categoria sem fornecedor com API real: nada de catálogo de exemplo
  if (!(await categoryAvailable("LODGING"))) return <ComingSoon title="Hospedagem" base={`/loja/${store.slug}`} />;
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
  const f = parseFilters(raw);
  const filtered = results
    .filter((r) => (!f.estrelas || (r.stars ?? 0) >= f.estrelas) && (!f.cafe || r.perks?.breakfast) && (!f.reembolsavel || r.perks?.refundable))
    .sort((a, b) => (f.ordem === "preco-desc" ? b.price.pix.comparedTo(a.price.pix) : f.ordem === "estrelas" ? (b.stars ?? 0) - (a.stars ?? 0) || a.price.pix.comparedTo(b.price.pix) : a.price.pix.comparedTo(b.price.pix)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(raw.pagina) || 1));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const link = (patch: Partial<Filters>) => `${base}?${lodgingQuery(d)}${filterQuery({ ...f, ...patch })}`;
  const count = (pred: (r: (typeof results)[number]) => boolean) => results.filter(pred).length;
  const userMessage = failures.find((f) => f.message)?.message;

  return (
    <main>
      {searched ? (
        <ListingHeader eyebrow="Hospedagem" compact title={d.destino ? `Hotéis em ${d.destino.split(",")[0]}` : "Hotéis"}>
          <MobileSearchToggle summary={d.destino || "Hotéis"} detail={`${shortDate(d.checkin)} – ${shortDate(d.checkout)} · ${note}`}>
            <LodgingSearch action={base} d={d} destinations={destinations} minDate={minDate} />
          </MobileSearchToggle>
        </ListingHeader>
      ) : (
        <ListingHeader eyebrow="Hospedagem" image="palmPool" title="Hotéis no mundo todo." subtitle="Comparamos vários fornecedores e mostramos o melhor preço para a sua estadia.">
          <LodgingSearch action={base} d={d} destinations={destinations} minDate={minDate} />
        </ListingHeader>
      )}
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-8 sm:px-8 sm:pt-12">
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
              {filtered.length} {filtered.length === 1 ? "hotel" : "hotéis"}
              {d.destino ? ` em “${d.destino}”` : ""} · {date(d.checkin)} a {date(d.checkout)} · {note}
              {pages > 1 ? ` · página ${page} de ${pages}` : ""}
            </p>
            {failures.length > 0 && results.length > 0 && <Alert tone="info" className="mb-8">Um dos fornecedores não respondeu agora — mostrando as ofertas dos demais.</Alert>}
            {results.length > 1 && (
              <div className="no-scrollbar -mx-4 mb-8 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                <span className="mr-1 shrink-0 text-[13px] font-semibold text-muted">Ordenar</span>
                <Chip href={link({ ordem: "preco" })} active={f.ordem === "preco"}>
                  Menor preço
                </Chip>
                <Chip href={link({ ordem: "preco-desc" })} active={f.ordem === "preco-desc"}>
                  Maior preço
                </Chip>
                <Chip href={link({ ordem: "estrelas" })} active={f.ordem === "estrelas"}>
                  Mais estrelas
                </Chip>
                <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
                <Chip href={link({ cafe: !f.cafe })} active={f.cafe}>
                  Café da manhã <span className="opacity-60">{count((r) => !!r.perks?.breakfast)}</span>
                </Chip>
                <Chip href={link({ reembolsavel: !f.reembolsavel })} active={f.reembolsavel}>
                  Reembolsável <span className="opacity-60">{count((r) => !!r.perks?.refundable)}</span>
                </Chip>
                {[3, 4, 5].map((n) => (
                  <Chip key={n} href={link({ estrelas: f.estrelas === n ? 0 : n })} active={f.estrelas === n}>
                    {n === 5 ? "5★" : `${n}★ ou mais`} <span className="opacity-60">{count((r) => (r.stars ?? 0) >= n)}</span>
                  </Chip>
                ))}
                {(f.cafe || f.reembolsavel || f.estrelas > 0) && (
                  <Link href={link({ cafe: false, reembolsavel: false, estrelas: 0 })} scroll={false} className="shrink-0 px-2 text-[13px] font-semibold text-muted underline-offset-2 hover:underline">
                    Limpar filtros
                  </Link>
                )}
              </div>
            )}
            {results.length > 0 && filtered.length === 0 ? (
              <div className="rounded-[2rem] bg-surface p-8 text-center">
                <p className="text-lg font-semibold text-ink">Nenhum hotel com esses filtros.</p>
                <Link href={link({ cafe: false, reembolsavel: false, estrelas: 0 })} className="mt-2 inline-block text-[14px] font-semibold text-accent-ink underline">
                  Limpar filtros
                </Link>
              </div>
            ) : results.length === 0 ? (
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
                  <ProductCard key={productRef(p.supplierCode, p.productId)} p={p} href={`${base}/${productRef(p.supplierCode, p.productId)}?${q}`} note={`total · ${nights} noite${nights > 1 ? "s" : ""}`} nights={nights} />
                ))}
              </div>
            )}
            {pages > 1 && (
              <nav className="mt-14 flex items-center justify-center gap-2" aria-label="Páginas">
                {page > 1 && (
                  <ButtonLink href={`${link({})}&pagina=${page - 1}`} variant="outline">
                    ← Anterior
                  </ButtonLink>
                )}
                <span className="px-3 text-[14px] font-semibold text-muted tabular">
                  {page} / {pages}
                </span>
                {page < pages && (
                  <ButtonLink href={`${link({})}&pagina=${page + 1}`} variant="outline">
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
