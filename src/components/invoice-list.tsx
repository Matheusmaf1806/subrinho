/** Lista de notas fiscais registradas (com os arquivos para baixar). */
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui";
import { brl, date } from "@/lib/format";
import type { invoices } from "@/server/db/schema";

type Invoice = typeof invoices.$inferSelect;

export function InvoiceList({ list, fileHref, cancel }: { list: Invoice[]; fileHref: (fileId: string) => string; cancel?: (inv: Invoice) => React.ReactNode }) {
  if (!list.length) return null;
  return (
    <ul className="space-y-2">
      {list.map((inv) => (
        <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface px-3 py-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className="font-semibold">
            NF {inv.number}
            {inv.series ? ` (série ${inv.series})` : ""}
          </span>
          <span className="text-muted">
            {date(inv.issuedAt)} · {brl(inv.amount)}
          </span>
          {inv.status === "CANCELLED" && <Badge tone="danger">Cancelada</Badge>}
          {inv.fileId && (
            <a href={fileHref(inv.fileId)} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-ink hover:underline">
              PDF
            </a>
          )}
          {inv.xmlFileId && (
            <a href={fileHref(inv.xmlFileId)} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-ink hover:underline">
              XML
            </a>
          )}
          {inv.url && (
            <a href={inv.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-ink hover:underline">
              Consultar
            </a>
          )}
          {inv.notes && <span className="w-full text-xs text-muted">{inv.notes}</span>}
          {cancel && inv.status === "ISSUED" && <span className="ml-auto">{cancel(inv)}</span>}
        </li>
      ))}
    </ul>
  );
}
