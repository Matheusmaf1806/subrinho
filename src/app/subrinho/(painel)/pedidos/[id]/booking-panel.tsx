/** Reserva no fornecedor (hotéis com API real): status, localizador e emissão controlada. */
import { Building2, RefreshCw, Send } from "lucide-react";
import { Alert, Badge, buttonClass } from "@/components/ui";
import { ActionForm, Modal, SubmitButton } from "@/components/ui-client";
import type { orderItems } from "@/server/db/schema";
import { BOOKING_STATUS_LABEL } from "@/server/bookings/service";
import { dateTime, money } from "@/lib/format";
import { supplierName } from "../../../_lib/rules";
import { issueBookingAction, refreshBookingAction } from "./actions";

type Item = typeof orderItems.$inferSelect;

const CAN_ISSUE = new Set([null, "", "AWAITING_ISSUE", "BOOKING_FAILED", "ISSUE_UNKNOWN", "REJECTED"]);

function tone(status: string | null): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "CONFIRMED") return "success";
  if (status === "PENDING" || status === "AWAITING_ISSUE" || status === "ISSUING" || status === "ISSUE_UNKNOWN") return "warning";
  if (status === "BOOKING_FAILED" || status === "REJECTED" || status === "CANCELLED") return "danger";
  return "neutral";
}

export function SupplierBookingPanel({ item: i, live, orderPaid, canAct }: { item: Item; live: boolean; orderPaid: boolean; canAct: boolean }) {
  const p = (i.supplierPayload ?? {}) as Record<string, unknown>;
  const s = i.supplierStatus;
  const str = (k: string) => (typeof p[k] === "string" && (p[k] as string).trim() ? (p[k] as string) : null);
  const canIssue = live && orderPaid && canAct && CAN_ISSUE.has(s);
  const canRefresh = live && canAct && (!!i.supplierBookingRef || (!!str("reference") && s !== "AWAITING_ISSUE"));
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
            <Building2 className="h-4 w-4 text-muted" aria-hidden /> Reserva no fornecedor
            <Badge tone={tone(s)}>{s ? (BOOKING_STATUS_LABEL[s] ?? s) : live ? "Aguardando pagamento" : "—"}</Badge>
            {!live && <Badge tone="neutral">Catálogo simulado</Badge>}
          </p>
          {i.supplierBookingRef && (
            <p>
              Localizador {supplierName(i.supplierCode)}: <strong className="font-mono">{i.supplierBookingRef}</strong>
              {str("goReference") && <span className="text-muted"> · ref. {str("goReference")}</span>}
            </p>
          )}
          {str("hotelConfirmation") && <p>Confirmação do hotel: <strong className="font-mono">{str("hotelConfirmation")}</strong></p>}
          {str("reference") && <p className="text-muted">Nossa referência no fornecedor: <span className="font-mono">{str("reference")}</span></p>}
          {str("payableThrough") && (
            <p className="text-muted">
              Voucher: “Pagável através de {str("payableThrough")}, atuando como agente{str("supplierVatNumber") ? `, VAT ${str("supplierVatNumber")}` : ""}”.
            </p>
          )}
          {str("bookedPrice") && <p className="text-muted">Custo reservado: {money(str("bookedPrice")!, (str("currency") ?? i.costCurrency) as "USD")}</p>}
          {str("issuedAt") && (
            <p className="text-xs text-muted">
              Emitida em {dateTime(new Date(str("issuedAt")!))}
              {str("issuedBy") ? ` por ${str("issuedBy")}` : ""}
              {p.recoveredExisting || p.recoveredAfterTimeout || p.recoveredAfterError ? " · reserva existente recuperada (sem duplicar)" : ""}
            </p>
          )}
        </div>
        {(canIssue || canRefresh) && (
          <div className="flex flex-wrap gap-2">
            {canRefresh && (
              <ActionForm action={refreshBookingAction}>
                <input type="hidden" name="itemId" value={i.id} />
                <input type="hidden" name="orderId" value={i.orderId} />
                <SubmitButton variant="outline" size="sm" pendingText="Consultando…">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Consultar no fornecedor
                </SubmitButton>
              </ActionForm>
            )}
            {canIssue && (
              <Modal
                title="Emitir reserva no fornecedor"
                triggerClassName={buttonClass("primary", "sm")}
                trigger={
                  <>
                    <Send className="h-3.5 w-3.5" aria-hidden /> {s === "AWAITING_ISSUE" || !s ? "Emitir reserva" : "Tentar de novo"}
                  </>
                }
              >
                <ActionForm action={issueBookingAction} className="space-y-4">
                  <input type="hidden" name="itemId" value={i.id} />
                  <input type="hidden" name="orderId" value={i.orderId} />
                  <Alert tone="warning" title="Reserva real, com custo">
                    A reserva será feita agora na <strong>{supplierName(i.supplierCode)}</strong> com os hóspedes, as datas e o quarto deste pedido.
                  </Alert>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    <li>Antes de reservar, o sistema procura uma reserva já feita com a nossa referência — nunca reserva duas vezes.</li>
                    <li>
                      Não reserva se o fornecedor pedir mais que o custo vendido ({money(i.costForeign, i.costCurrency)}).
                    </li>
                    <li>Confira os nomes dos hóspedes em “Viajantes” antes de emitir.</li>
                  </ul>
                  <SubmitButton pendingText="Reservando no fornecedor…">Confirmar e emitir</SubmitButton>
                </ActionForm>
              </Modal>
            )}
          </div>
        )}
      </div>
      {str("error") && s !== "CONFIRMED" && (
        <Alert tone="danger" className="mt-3" title="Último erro do fornecedor">
          {str("error")}
        </Alert>
      )}
      {s === "ISSUE_UNKNOWN" && (
        <Alert tone="warning" className="mt-3">
          O fornecedor não respondeu a tempo. Clique em “Consultar no fornecedor” para verificar se a reserva foi criada antes de tentar de novo.
        </Alert>
      )}
    </div>
  );
}
