import { CalendarDays, MapPin, Trash2 } from "lucide-react";
import { Badge, buttonClass } from "@/components/ui";
import { brl, date, paxSummary } from "@/lib/format";
import type { ActionState } from "@/components/ui-client";
import { categoryIcon, categoryLabel } from "./category";
import type { ItemVM } from "./cart-vm";
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
  const Icon = categoryIcon(item.category);
  const hasDiscount = Number(item.discount) > 0;
  return (
    <article className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cream text-accent">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{categoryLabel(item.category)}</p>
              <h3 className="text-base font-extrabold leading-snug text-ink">{item.title}</h3>
              {item.subtitle && <p className="text-sm text-muted">{item.subtitle}</p>}
            </div>
            <div className="text-right tabular">
              {hasDiscount && <p className="text-xs text-muted line-through">{brl(item.listPix)}</p>}
              <p className="text-lg font-black text-ink">{brl(item.pix)}</p>
              <p className="text-xs text-muted">no Pix · {brl(item.installment)} parcelado</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {item.serviceDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> {date(item.serviceDate)}
                {item.serviceEndDate ? ` a ${date(item.serviceEndDate)}` : ""}
              </span>
            )}
            {item.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {item.location}
              </span>
            )}
            {paxSummary(item.pax) && <span>{paxSummary(item.pax)}</span>}
          </div>
          <ul className="mt-2 space-y-0.5 text-sm text-ink">
            {item.lines.map((l, i) => (
              <li key={i}>
                <span className="font-bold tabular">{l.quantity}×</span> {l.label}
              </li>
            ))}
          </ul>
          {hasDiscount && (
            <Badge tone="success" className="mt-2">
              Desconto de {brl(item.discount)}
            </Badge>
          )}
          {editable && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {paxAction && <PaxModal item={item} action={paxAction} />}
              {item.admin && marginAction && <MarginModal item={item} action={marginAction} maxPct={maxMarginPct} />}
              {item.admin?.source === "OVERRIDE" && <Badge tone="dark">Margem alterada neste carrinho</Badge>}
              {removeAction && (
                <form action={removeAction}>
                  <button className={buttonClass("ghost", "sm", "text-muted hover:text-red-700")}>
                    <Trash2 className="h-4 w-4" /> Remover
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
