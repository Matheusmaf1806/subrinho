"use client";

/**
 * "Complete sua viagem" no carrinho flutuante: 3 sugestões do mesmo destino e período do item mais
 * recente (hotel → experiências, experiência → hotéis), cada uma com o "Adicionar" já preenchido com
 * as datas e pessoas do carrinho. Os dados vêm de crossSellAction (ver _lib/cross-sell.ts).
 */
import Link from "next/link";
import { ArrowRight, MapPin, Sparkles } from "lucide-react";
import type { ActionState } from "@/components/ui-client";
import { addToCartAction, quickOptionsAction } from "../actions";
import type { CrossSell } from "../_lib/cross-sell";
import { QuickAdd, type QuickCtx } from "./quick-add";

const fmt = (v: string | number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CrossSellBlock({ slug, data, pixAvailable, onNavigate }: { slug: string; data: CrossSell; pixAvailable: boolean; onNavigate: () => void }) {
  const ctx: QuickCtx = {
    add: (prev: ActionState, fd: FormData) => addToCartAction(slug, prev, fd),
    options: (ref, input) => quickOptionsAction(slug, ref, input),
    defaults: data.defaults,
    minDate: data.minDate,
  };
  return (
    <section className="mt-2 rounded-[1.5rem] bg-surface p-4" aria-label={data.heading}>
      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Complete sua viagem
      </p>
      <h3 className="mt-1 text-[18px] font-semibold leading-tight tracking-[-0.03em] text-ink">{data.heading}</h3>
      <p className="mt-0.5 text-[12px] text-muted">{data.lead}</p>
      <ul className="mt-3 space-y-2">
        {data.items.map((s) => (
          <li key={s.ref} className="flex gap-3 rounded-2xl bg-white p-2.5 shadow-[0_8px_24px_-18px_rgba(10,10,11,0.4)]">
            <Link href={s.href} onClick={onNavigate} className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-surface-2" tabIndex={-1} aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.imageUrl && <img src={s.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <Link href={s.href} onClick={onNavigate} className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink hover:underline">
                {s.title}
              </Link>
              {(s.stars || s.place) && (
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                  {s.stars ? <span className="shrink-0 text-amber-500">{"★".repeat(Math.floor(s.stars))}</span> : <MapPin className="h-3 w-3 shrink-0" aria-hidden />}
                  {s.place && <span className="truncate">{s.place}</span>}
                </p>
              )}
              <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                <p className="min-w-0 leading-tight">
                  <span className="text-[11px] text-muted">a partir de </span>
                  <span className="text-[14px] font-semibold text-ink tabular">{fmt(pixAvailable ? s.pix : s.installment)}</span>
                  <span className="block text-[11px] text-muted">{s.per === "adult" ? "por adulto" : "total da estadia"}</span>
                  {s.commission && <span className="block text-[11px] font-semibold text-emerald-700 tabular">comissão {fmt(s.commission)}</span>}
                  {s.supplier && <span className="mt-0.5 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900">{s.supplier}</span>}
                </p>
                <QuickAdd ctx={ctx} productRef={s.ref} category={s.category} title={s.title} destination={data.destination} size="sm" className="shrink-0" />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Link href={data.more.href} onClick={onNavigate} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
        {data.more.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
      {data.extras.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-[12px] text-muted">Não esqueça:</span>
          {data.extras.map((x) => (
            <Link key={x.href} href={x.href} onClick={onNavigate} className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-ink transition hover:bg-surface-2">
              {x.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function CrossSellSkeleton() {
  return (
    <div className="mt-2 rounded-[1.5rem] bg-surface p-4" aria-busy="true" aria-label="Carregando sugestões">
      <span className="block h-3 w-32 animate-pulse rounded bg-surface-2" />
      <span className="mt-2 block h-5 w-48 animate-pulse rounded bg-surface-2" />
      <ul className="mt-3 space-y-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex gap-3 rounded-2xl bg-white p-2.5">
            <span className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-xl bg-surface" />
            <span className="flex-1 space-y-2 py-1">
              <span className="block h-4 w-4/5 animate-pulse rounded bg-surface" />
              <span className="block h-3 w-1/2 animate-pulse rounded bg-surface" />
              <span className="block h-4 w-1/3 animate-pulse rounded bg-surface" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
