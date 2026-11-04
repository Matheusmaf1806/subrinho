import Link from "next/link";
import { db } from "@/server/db";
import { productRef } from "@/server/suppliers/refs";
import { searchCatalog } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { SupplierError } from "@/server/suppliers/types";
import { Alert, ButtonLink } from "@/components/ui";
import { date } from "@/lib/format";
import { addDays, daysBetween } from "@/lib/tz";
import { categoryAvailable } from "../_lib/categories";
import { ComingSoon } from "../_components/coming-soon";
import { getStore, getStorePricing } from "../_lib/store";
import { LodgingSearch } from "../_components/search-forms";
import { parseSearch, supplierParams, toQuery } from "../_components/search-params";
import { ListingHeader, NoResults } from "../_components/listing";
import { ProductCard } from "../_components/product-card";
import { MobileSearchToggle } from "../_components/search-toggle";

export const metadata = { title: "Casas" };
// Cotação de todas as casas disponíveis nas datas (a administradora calcula aluguel + taxas + impostos).
export const maxDuration = 60;

const PAGE_SIZE = 24;
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "");

type Filters = { ordem: "preco" | "preco-desc" | "quartos"; quartos: number; piscina: boolean };

function parseFilters(raw: Record<string, string>): Filters {
  const ordem = raw.ordem === "preco-desc" || raw.ordem === "quartos" ? raw.ordem : "preco";
  const quartos = [2, 3, 4, 5, 6].includes(Number(raw.quartos_min)) ? Number(raw.quartos_min) : 0;
  return { ordem, quartos, piscina: raw.piscina === "1" };
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

export default async function HousesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const store = await getStore((await params).slug);
  // categoria sem fornecedor com API real: nada de catálogo de exemplo
  if (!(await categoryAvailable("HOUSES"))) return <ComingSoon title="Casas" base={`/loja/${store.slug}`} />;
  const ctx = await getStorePricing(store.id);
  const raw = await searchParams;
  const parsed = parseSearch(raw);
  // Casas: estadia padrão de 7 noites
  const d = { ...parsed.d, checkout: raw.checkout ? parsed.d.checkout : addDays(parsed.d.checkin, 7) };
  const failures: { code: string; message: string | null }[] = [];
  const results = await searchCatalog(db, ctx, "HOUSES", supplierParams(d, "houses"), {
    onError: (code, e) => failures.push({ code, message: e instanceof SupplierError && !("detail" in e) ? e.message : null }),
  });
  const base = `/loja/${store.slug}/casas`;
  const nights = daysBetween(d.checkin, d.checkout);
  const guests = d.adultos + d.criancas;
  const q = toQuery({ destino: d.destino, checkin: d.checkin, checkout: d.checkout, adultos: d.adultos, criancas: d.criancas });
  const destinations = [...new Set(adaptersFor("HOUSES").flatMap((a) => a.destinations().map((x) => x.name)))];
  const searched = !!(raw.checkin || raw.destino);
  const f = parseFilters(raw);
  const filtered = results
    .filter((r) => (!f.quartos || (r.house?.bedrooms ?? 0) >= f.quartos) && (!f.piscina || r.house?.privatePool))
    .sort((a, b) =>
      f.ordem === "preco-desc" ? b.price.pix.comparedTo(a.price.pix) : f.ordem === "quartos" ? (b.house?.bedrooms ?? 0) - (a.house?.bedrooms ?? 0) || a.price.pix.comparedTo(b.price.pix) : a.price.pix.comparedTo(b.price.pix),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(raw.pagina) || 1));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const link = (patch: Partial<Filters>) => {
    const g = { ...f, ...patch };
    const extra = new URLSearchParams();
    if (g.ordem !== "preco") extra.set("ordem", g.ordem);
    if (g.quartos) extra.set("quartos_min", String(g.quartos));
    if (g.piscina) extra.set("piscina", "1");
    const e = extra.toString();
    return `${base}?${q}${e ? `&${e}` : ""}`;
  };
  const count = (pred: (r: (typeof results)[number]) => boolean) => results.filter(pred).length;
  const userMessage = failures.find((x) => x.message)?.message;
  const note = `${nights} noite${nights > 1 ? "s" : ""} · ${guests} hóspede${guests > 1 ? "s" : ""}`;
  const search = <LodgingSearch action={base} d={d} destinations={destinations} minDate={parsed.minDate} houses />;

  return (
    <main>
      {searched ? (
        <ListingHeader eyebrow="Casas" compact title={d.destino ? `Casas em ${d.destino.split(",")[0]}` : "Casas de temporada"}>
          <MobileSearchToggle summary={d.destino || "Casas de temporada"} detail={`${shortDate(d.checkin)} – ${shortDate(d.checkout)} · ${note}`}>
            {search}
          </MobileSearchToggle>
        </ListingHeader>
      ) : (
        <ListingHeader eyebrow="Casas" image="villaPool" title="Casa com piscina perto dos parques." subtitle="Ideal para famílias e grupos: espaço, cozinha e piscina privativa.">
          {search}
        </ListingHeader>
      )}
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-8 sm:px-8 sm:pt-12">
        <p className="mb-8 text-[15px] text-muted">
          {filtered.length} {filtered.length === 1 ? "casa disponível" : "casas disponíveis"}
          {d.destino ? ` em “${d.destino}”` : ""} · {date(d.checkin)} a {date(d.checkout)} · {note}
          {pages > 1 ? ` · página ${page} de ${pages}` : ""}
        </p>
        {failures.length > 0 && results.length > 0 && <Alert tone="info" className="mb-8">Um dos fornecedores não respondeu agora — mostrando as casas dos demais.</Alert>}
        {results.length > 1 && (
          <div className="no-scrollbar -mx-4 mb-8 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <span className="mr-1 shrink-0 text-[13px] font-semibold text-muted">Ordenar</span>
            <Chip href={link({ ordem: "preco" })} active={f.ordem === "preco"}>
              Menor preço
            </Chip>
            <Chip href={link({ ordem: "preco-desc" })} active={f.ordem === "preco-desc"}>
              Maior preço
            </Chip>
            <Chip href={link({ ordem: "quartos" })} active={f.ordem === "quartos"}>
              Mais quartos
            </Chip>
            <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
            {(f.piscina || count((r) => !!r.house?.privatePool) > 0) && (
              <Chip href={link({ piscina: !f.piscina })} active={f.piscina}>
                Piscina privativa <span className="opacity-60">{count((r) => !!r.house?.privatePool)}</span>
              </Chip>
            )}
            {[3, 4, 5, 6]
              .filter((n) => f.quartos === n || count((r) => (r.house?.bedrooms ?? 0) >= n) > 0)
              .map((n) => (
                <Chip key={n} href={link({ quartos: f.quartos === n ? 0 : n })} active={f.quartos === n}>
                  {n}+ quartos <span className="opacity-60">{count((r) => (r.house?.bedrooms ?? 0) >= n)}</span>
                </Chip>
              ))}
            {(f.piscina || f.quartos > 0) && (
              <Link href={link({ piscina: false, quartos: 0 })} scroll={false} className="shrink-0 px-2 text-[13px] font-semibold text-muted underline-offset-2 hover:underline">
                Limpar filtros
              </Link>
            )}
          </div>
        )}
        {results.length > 0 && filtered.length === 0 ? (
          <div className="rounded-[2rem] bg-surface p-8 text-center">
            <p className="text-lg font-semibold text-ink">Nenhuma casa com esses filtros.</p>
            <Link href={link({ piscina: false, quartos: 0 })} className="mt-2 inline-block text-[14px] font-semibold text-accent-ink underline">
              Limpar filtros
            </Link>
          </div>
        ) : results.length === 0 ? (
          failures.length > 0 && !userMessage ? (
            <Alert tone="warning">Não conseguimos consultar as casas agora. Tente novamente em instantes.</Alert>
          ) : userMessage ? (
            <Alert tone="warning">{userMessage}</Alert>
          ) : (
            <div className="space-y-4">
              <NoResults what="casa" />
              <p className="text-center text-[14px] text-muted">Casas costumam ter estadia mínima: tente outras datas, mais noites ou menos hóspedes.</p>
            </div>
          )
        ) : (
          <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => (
              <ProductCard key={productRef(p.supplierCode, p.productId)} p={p} href={`${base}/${productRef(p.supplierCode, p.productId)}?${q}`} note="taxas inclusas" nights={nights} />
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
      </div>
    </main>
  );
}
