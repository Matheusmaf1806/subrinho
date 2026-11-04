/**
 * "Complete sua viagem" nas páginas de detalhe: outra categoria no mesmo destino e período.
 *  - hotel ou casa → experiências para o dia seguinte ao check-in;
 *  - ingresso → onde ficar, chegando um dia antes da visita (3 noites; casas se não houver hotel).
 * O "Adicionar" dos cards já vem com essas datas. Carrega em paralelo (Suspense, ver related.tsx).
 */
import type { Reveal } from "@/server/catalog";
import type { PricingContext } from "@/server/pricing/cart-pricing";
import { addDays } from "@/lib/tz";
import { categoryAvailable } from "../_lib/categories";
import { RelatedProducts } from "./related";
import { lodgingQuery, supplierParams, toQuery } from "./search-params";
import type { SearchDefaults } from "./search-forms";
import type { QuickCtx } from "./quick-add";

const STAY_NIGHTS = 3;

export async function CompleteTrip({
  slug,
  from,
  destination,
  d,
  minDate,
  ctx,
  reveal,
  quick,
}: {
  slug: string;
  /** Página atual: estadia (hotel/casa) ou ingresso. */
  from: "stay" | "ticket";
  destination: string;
  d: Required<SearchDefaults>;
  minDate: string;
  ctx: PricingContext;
  reveal: Reveal;
  quick: QuickCtx;
}) {
  const city = destination.split(",")[0].trim();
  if (!city) return null;
  const base = `/loja/${slug}`;

  if (from === "stay") {
    if (!(await categoryAvailable("TICKETS"))) return null;
    const day = addDays(d.checkin, 1) < d.checkout ? addDays(d.checkin, 1) : d.checkin;
    const t = { ...d, destino: city, data: day };
    return (
      <RelatedProducts
        eyebrow="Complete sua viagem"
        order="best"
        title={`Experiências em ${city}`}
        category="TICKETS"
        ctx={ctx}
        reveal={reveal}
        params={supplierParams(t, "tickets")}
        current={{ supplierCode: "", productId: "" }}
        hrefBase={`${base}/ingressos`}
        query={toQuery({ destino: city, data: day, adultos: d.adultos, criancas: d.criancas })}
        note="adulto"
        quick={{ ...quick, defaults: { ...quick.defaults, date: day } }}
      />
    );
  }

  const lodging = await categoryAvailable("LODGING");
  const houses = !lodging && (await categoryAvailable("HOUSES"));
  if (!lodging && !houses) return null;
  const before = addDays(d.data, -1);
  const checkin = before >= minDate ? before : minDate;
  const checkout = addDays(checkin, STAY_NIGHTS);
  const s = { ...d, destino: city, dest: "", checkin, checkout };
  return (
    <RelatedProducts
      eyebrow="Complete sua viagem"
      order="best"
      title={lodging ? `Onde ficar em ${city}` : `Casas em ${city}`}
      category={lodging ? "LODGING" : "HOUSES"}
      ctx={ctx}
      reveal={reveal}
      params={supplierParams(s, lodging ? "lodging" : "houses")}
      current={{ supplierCode: "", productId: "" }}
      hrefBase={`${base}/${lodging ? "hospedagem" : "casas"}`}
      query={lodging ? lodgingQuery(s) : toQuery({ destino: city, checkin, checkout, adultos: d.adultos, criancas: d.criancas })}
      note={`${STAY_NIGHTS} noites`}
      nights={STAY_NIGHTS}
      quick={{ ...quick, defaults: { ...quick.defaults, checkin, checkout } }}
    />
  );
}
