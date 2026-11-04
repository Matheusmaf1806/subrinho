import Link from "next/link";
import { BadgeCheck, CalendarDays, Globe2, MapPin, QrCode, Radio, RefreshCw, Signal, Smartphone, Sparkles, Wifi } from "lucide-react";
import { db } from "@/server/db";
import { productRef } from "@/server/suppliers/refs";
import { searchCatalog, type PricedSummary } from "@/server/catalog";
import { adaptersFor } from "@/server/suppliers/registry";
import { cn } from "@/components/ui";
import { categoryAvailable } from "../_lib/categories";
import { ComingSoon } from "../_components/coming-soon";
import { getStore, getStorePricing } from "../_lib/store";
import { storeInsight } from "../_lib/insight";
import { SupplierTag } from "../_components/reveal";
import { ChipSearch } from "../_components/search-forms";
import { parseSearch, supplierParams, toQuery } from "../_components/search-params";
import { ListingHeader } from "../_components/listing";
import { AddToCartForm } from "../_components/add-to-cart";
import { PaxStepper } from "../_components/pax-stepper";
import { PriceTag } from "../_components/price-tag";
import { addToCartAction } from "../actions";
import type { ActionState } from "@/components/ui-client";

export const metadata = { title: "Chip internacional" };

const POPULAR = ["Estados Unidos", "Europa", "Itália", "França", "Portugal", "Espanha", "Reino Unido", "Japão", "Canadá", "Emirados Árabes", "Tailândia", "Coreia do Sul"];

const gb = (mb: number) => (mb >= 1024 ? `${Number.isInteger(mb / 1024) ? mb / 1024 : (mb / 1024).toFixed(1).replace(".", ",")} GB` : `${mb} MB`);

/**
 * Plano recomendado para a viagem: a menor validade que cobre os dias e, nela, a franquia mais
 * próxima de ~0,7 GB por dia (uso típico de mapas, redes sociais e mensagens).
 */
function recommend(list: PricedSummary[], days: number): PricedSummary | null {
  if (!days) return null;
  const fixed = list.filter((p) => p.chip && !p.chip.daily && p.chip.days >= days);
  if (!fixed.length) return null;
  const minDays = Math.min(...fixed.map((p) => p.chip!.days));
  const pool = fixed.filter((p) => p.chip!.days === minDays).sort((a, b) => a.chip!.dataMb - b.chip!.dataMb);
  const want = days * 0.7 * 1024;
  return pool.find((p) => p.chip!.dataMb >= want) ?? pool[pool.length - 1];
}

/** Página única: escolhe o destino, compara os planos de eSIM e adiciona ao carrinho. */
export default async function ChipPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const store = await getStore(slug);
  // categoria sem fornecedor com API real: nada de catálogo de exemplo
  if (!(await categoryAvailable("CHIP"))) return <ComingSoon title="Chip" base={`/loja/${store.slug}`} />;
  const ctx = await getStorePricing(store.id);
  const reveal = await storeInsight(store.id);
  const raw = await searchParams;
  const { d } = parseSearch(raw);
  // falha do fornecedor ≠ destino sem cobertura: a mensagem para o cliente é outra
  let failed = false;
  const results = d.destino
    ? await searchCatalog(db, ctx, "CHIP", supplierParams(d, "chip"), { reveal, onError: () => (failed = true) }).catch(() => {
        failed = true;
        return [] as PricedSummary[];
      })
    : [];
  const destinations = [...new Set(adaptersFor("CHIP").flatMap((a) => a.destinations().map((x) => x.name)))];
  const add = addToCartAction.bind(null, slug);
  const base = `/loja/${slug}/chip`;
  const daily = raw.tipo === "diario";
  const hasDaily = results.some((p) => p.chip?.daily);
  const shown = results.filter((p) => !!p.chip?.daily === (daily && hasDaily));
  const where = results[0]?.destination ?? d.destino;
  const best = daily ? null : recommend(results, d.dias);
  const groups = [...new Set(shown.map((p) => p.chip?.days ?? 0))].sort((a, b) => a - b).map((days) => ({ days, plans: shown.filter((p) => (p.chip?.days ?? 0) === days).sort((a, b) => (a.chip?.dataMb ?? 0) - (b.chip?.dataMb ?? 0)) }));
  const q = (extra: { tipo?: string }) => {
    const sp = new URLSearchParams(toQuery({ destino: d.destino, qtd: d.qtd > 1 ? d.qtd : undefined, dias: d.dias || undefined }));
    if (extra.tipo) sp.set("tipo", extra.tipo);
    return `${base}?${sp.toString()}`;
  };

  return (
    <main>
      <ListingHeader eyebrow="Chip internacional" image="phones" title="Chegue conectado." subtitle="eSIM com QR Code logo depois do pagamento. Instale antes de viajar e ative ao chegar.">
        <ChipSearch action={base} d={d} destinations={destinations} />
      </ListingHeader>

      <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-12 sm:px-8">
        {!d.destino ? (
          <section>
            <h2 className="text-[clamp(1.6rem,3vw,2.25rem)] font-semibold tracking-[-0.04em] text-ink">Para onde você vai?</h2>
            <p className="mt-1 text-[15px] text-muted">Escolha o país ou a região. Planos de vários países cobrem a viagem inteira com um eSIM só.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {POPULAR.map((n) => (
                <Link key={n} href={`${base}?${toQuery({ destino: n })}`} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2.5 text-[14px] font-semibold text-ink transition hover:bg-surface-2">
                  <MapPin className="h-4 w-4 text-accent-ink" aria-hidden /> {n}
                </Link>
              ))}
            </div>
          </section>
        ) : results.length === 0 && failed ? (
          <section className="rounded-[2rem] bg-surface p-8 text-center sm:p-12" role="status">
            <Globe2 className="mx-auto h-10 w-10 text-muted" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold text-ink">Não conseguimos consultar os planos agora</h2>
            <p className="mx-auto mt-1 max-w-md text-[15px] text-muted">Tente de novo em alguns minutos. Se precisar, fale com a agência pelo WhatsApp.</p>
            <Link href={`${base}?${toQuery({ destino: d.destino, dias: d.dias || undefined })}`} className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-5 text-[14px] font-semibold text-white transition hover:bg-ink-2">
              Tentar de novo
            </Link>
          </section>
        ) : results.length === 0 ? (
          <section className="rounded-[2rem] bg-surface p-8 text-center sm:p-12">
            <Globe2 className="mx-auto h-10 w-10 text-muted" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold text-ink">Ainda não temos eSIM para “{d.destino}”</h2>
            <p className="mx-auto mt-1 max-w-md text-[15px] text-muted">Tente o país da viagem (ex.: Itália) ou a região (ex.: Europa).</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {POPULAR.slice(0, 8).map((n) => (
                <Link key={n} href={`${base}?${toQuery({ destino: n })}`} className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-surface-2">
                  {n}
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-[clamp(1.6rem,3vw,2.25rem)] font-semibold tracking-[-0.04em] text-ink">eSIM para {where}</h2>
                <p className="mt-1 text-[15px] text-muted">
                  {results.length} planos · preço por chip{d.dias ? ` · viagem de ${d.dias} dia${d.dias > 1 ? "s" : ""}` : ""}. Alguns planos também funcionam nos países vizinhos.
                </p>
              </div>
              {hasDaily && (
                <nav className="inline-flex rounded-full bg-surface p-1 text-[13px] font-semibold" aria-label="Tipo de franquia">
                  <Link href={q({})} className={cn("rounded-full px-4 py-2 transition", !daily ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")} aria-current={!daily ? "page" : undefined}>
                    Franquia total
                  </Link>
                  <Link href={q({ tipo: "diario" })} className={cn("rounded-full px-4 py-2 transition", daily ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")} aria-current={daily ? "page" : undefined}>
                    Franquia por dia
                  </Link>
                </nav>
              )}
            </div>

            {best && (
              <div className="mt-8">
                <p className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-ink">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> Recomendado para {d.dias} dia{d.dias > 1 ? "s" : ""}
                </p>
                <ChipCard p={best} add={add} qty={d.qtd} destination={where} featured />
              </div>
            )}

            {groups.map((g) => (
              <section key={g.days} className="mt-10">
                <h3 className="mb-4 flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em] text-ink">
                  <CalendarDays className="h-4 w-4 text-muted" aria-hidden /> {g.days} dias
                  {d.dias > 0 && g.days < d.dias && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-semibold text-amber-800">menos que a viagem</span>}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {g.plans.map((p) => (
                    <ChipCard key={p.productId} p={p} add={add} qty={d.qtd} destination={where} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        <section className="mt-16 grid gap-3 md:grid-cols-3" aria-label="Como funciona">
          {[
            { icon: QrCode, title: "Receba o QR Code", text: "Logo depois do pagamento, na página do pedido. Um código para cada chip." },
            { icon: Smartphone, title: "Instale antes de viajar", text: "Com Wi-Fi, em Ajustes › Celular › Adicionar eSIM. No iPhone dá para instalar com um toque." },
            { icon: Radio, title: "Ative ao chegar", text: "Ligue o eSIM e os dados em roaming no destino. A validade começa na primeira conexão." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-[1.75rem] bg-surface p-6">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-accent-ink">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-4 text-[16px] font-semibold text-ink">{title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </section>
        <p className="mt-4 text-[13px] text-muted">O celular precisa aceitar eSIM e estar desbloqueado (iPhone XS ou mais novo, Galaxy S20 ou mais novo, Pixel 3 ou mais novo e outros). O seu número do Brasil continua no chip físico.</p>
      </div>
    </main>
  );
}

function ChipCard({ p, add, qty, destination, featured }: { p: PricedSummary; add: (prev: ActionState, fd: FormData) => Promise<ActionState>; qty: number; destination: string; featured?: boolean }) {
  const c = p.chip;
  return (
    <div className={cn("flex flex-col rounded-[2rem] p-6", featured ? "bg-ink text-white sm:flex-row sm:items-center sm:gap-8 sm:p-8" : "bg-surface")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {c && (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold", featured ? "bg-white/10" : "bg-white")}>
              <Signal className="h-3.5 w-3.5" aria-hidden /> {c.network}
            </span>
          )}
          {c?.tethering && (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold", featured ? "bg-white/10" : "bg-white")}>
              <Wifi className="h-3.5 w-3.5" aria-hidden /> Hotspot
            </span>
          )}
          {c?.topup && (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold", featured ? "bg-white/10" : "bg-white")}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Recarregável
            </span>
          )}
        </div>
        <p className="mt-6 text-[2.75rem] font-semibold leading-none tracking-[-0.06em]">
          {c ? gb(c.dataMb) : p.title}
          {c?.daily && <span className={cn("ml-1 text-[1rem] font-semibold tracking-normal", featured ? "text-white/70" : "text-muted")}>por dia</span>}
        </p>
        <p className={cn("mt-1.5 text-[15px] font-semibold", featured ? "text-white/85" : "text-ink")}>{c ? `${c.days} dias` : p.subtitle}</p>
        {c && (
          <details className="group mt-3 text-[13px]">
            <summary className={cn("inline-flex cursor-pointer list-none items-center gap-1.5", featured ? "text-white/75" : "text-muted")}>
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {c.coverage}
              {c.countries.length > 1 && <span className="underline decoration-current/30 underline-offset-2">ver países</span>}
            </summary>
            {c.countries.length > 1 && <p className={cn("mt-2 leading-relaxed", featured ? "text-white/75" : "text-muted")}>{c.countries.join(", ")}</p>}
          </details>
        )}
        {c?.operators.length ? <p className={cn("mt-1 text-[12px]", featured ? "text-white/60" : "text-muted")}>Rede {c.operators.slice(0, 3).join(", ")}</p> : null}
        {c?.throttle && <p className={cn("mt-1 text-[12px]", featured ? "text-white/60" : "text-muted")}>{c.throttle}</p>}
      </div>
      <div className={cn("mt-6", featured && "sm:mt-0 sm:w-[320px]")}>
        <PriceTag pix={p.price.pix} plan={p.price.plan} size="sm" note="por chip" commission={p.price.commission} invert={featured} />
        <SupplierTag name={p.revealSupplier} className="mt-2" />
        <AddToCartForm action={add} hidden={{ ref: productRef(p.supplierCode, p.productId), optionId: p.productId, destino: destination }} className="mt-4">
          <div className={cn("rounded-2xl px-4 py-1", featured ? "bg-white text-ink" : "bg-white")}>
            <PaxStepper name="units" label="Quantidade" min={1} max={20} defaultValue={qty} />
          </div>
        </AddToCartForm>
        {featured && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-white/70">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Cobre a viagem toda
          </p>
        )}
      </div>
    </div>
  );
}
