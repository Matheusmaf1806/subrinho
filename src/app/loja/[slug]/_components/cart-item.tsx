import { BadgeCheck, CalendarDays, Info, MapPin, Trash2 } from "lucide-react";
import { brl, date, paxSummary } from "@/lib/format";
import type { ActionState } from "@/components/ui-client";
import { categoryLabel } from "./category";
import type { ItemVM } from "./cart-vm";
import { Cover } from "./cover";
import { MarginModal, PaxModal } from "./item-modals";

export function CartItemCard({
  item,
  editable,
  removeAction,
  paxAction,
  marginAction,
  maxMarginPct,
}: {
  item: ItemVM;
  editable: boolean;
  removeAction?: () => Promise<void>;
  paxAction?: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  marginAction?: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  maxMarginPct: string;
}) {
  const hasDiscount = Number(item.discount) > 0;
  return (
    <article className="grid gap-5 rounded-[2rem] bg-surface p-4 sm:grid-cols-[148px_1fr] sm:p-5">
      <Cover title={item.title} category={item.category} imageUrl={item.imageUrl} className="aspect-[4/3] sm:aspect-auto sm:h-full sm:min-h-[132px]" rounded="rounded-[1.5rem]" />
      <div className="min-w-0 py-1 sm:pr-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{categoryLabel(item.category)}</p>
            <h3 className="mt-1 text-[19px] font-semibold leading-snug tracking-[-0.025em] text-ink">{item.title}</h3>
            {item.subtitle && <p className="text-[14px] text-muted">{item.subtitle}</p>}
          </div>
          <div className="text-right tabular">
            {hasDiscount && <p className="text-xs text-muted line-through">{brl(item.listPix)}</p>}
            <p data-price className="text-[1.375rem] font-semibold leading-none tracking-[-0.035em] text-ink">{brl(item.pix)}</p>
            <p className="mt-1 text-xs text-muted">Pix · {brl(item.installment)} em 10x</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] font-medium text-ink/80">
          {item.serviceDate && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-muted" /> {date(item.serviceDate)}
              {item.serviceEndDate ? ` → ${date(item.serviceEndDate)}` : ""}
            </span>
          )}
          {item.location && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted" /> {item.location}
            </span>
          )}
          {paxSummary(item.pax) && <span className="rounded-full bg-white px-3 py-1.5">{paxSummary(item.pax)}</span>}
          {hasDiscount && <span className="rounded-full bg-emerald-100 px-3 py-1.5 font-semibold text-emerald-800">− {brl(item.discount)} de desconto</span>}
        </div>
        <ul className="mt-3 space-y-0.5 text-[13px] text-muted">
          {item.lines.map((l, i) => (
            <li key={i}>
              <span className="font-semibold text-ink tabular">{l.quantity}×</span> {l.label}
            </li>
          ))}
        </ul>
        {item.hotel && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
              {item.hotel.board && <span className="rounded-full bg-white px-3 py-1.5 text-ink">{item.hotel.board}</span>}
              {item.hotel.cancellation && (
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 ${item.hotel.freeCancellation ? "bg-emerald-100 text-emerald-800" : item.hotel.nonRefundable ? "bg-amber-100 text-amber-900" : "bg-white text-ink"}`}>
                  {item.hotel.freeCancellation && <BadgeCheck className="h-3.5 w-3.5" />}
                  {item.hotel.cancellation}
                </span>
              )}
            </div>
            {item.hotel.notes.map((n) => (
              <p key={n} className="flex items-start gap-1.5 text-[13px] text-ink/75">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" /> {n}
              </p>
            ))}
            {item.hotel.remarks && (
              <details className="group rounded-xl bg-white px-3 py-2 text-[13px]">
                <summary className="cursor-pointer list-none font-semibold text-ink">
                  <span className="mr-1.5 inline-block transition group-open:rotate-90">›</span>Informações importantes da tarifa
                </summary>
                <p className="mt-2 whitespace-pre-line text-ink/75">{item.hotel.remarks}</p>
                <p className="mt-2 text-xs text-muted">Texto enviado pelo fornecedor (pode estar em inglês).</p>
              </details>
            )}
          </div>
        )}
        {editable && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {paxAction && <PaxModal item={item} action={paxAction} />}
            {item.admin && marginAction && <MarginModal item={item} action={marginAction} maxPct={maxMarginPct} />}
            {item.admin?.source === "OVERRIDE" && <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">Margem alterada neste carrinho</span>}
            {removeAction && (
              <form action={removeAction}>
                <button className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-muted transition hover:bg-white hover:text-red-700">
                  <Trash2 className="h-4 w-4" /> Remover
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
