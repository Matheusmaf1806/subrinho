/**
 * Voucher da hospedagem (obrigatório para reservas confirmadas — exigência da Hotelbeds e prática
 * do mercado). Mostra hotel, hóspedes por quarto, localizadores, datas, quarto, regime, observações
 * da tarifa e, na Hotelbeds, o texto "Payable through…". Sem preço (recomendação do fornecedor).
 */
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { orderItems, orders, type PaxConfig, type PersonData } from "@/server/db/schema";
import { distributeRooms } from "@/server/suppliers/hotels/occupancy";
import { bookingReference } from "@/server/bookings/service";
import { date, orderNumber } from "@/lib/format";
import { getStore, viewerFor } from "../../../../_lib/store";
import { StoreMark } from "../../../../_components/store-mark";
import { stripSupplierMentions, stripSupplierMentionsList } from "@/lib/supplier-names";
import { PrintButton } from "./print-button";
import QRCode from "qrcode";
import { type Store } from "../../../../_lib/store";

export const metadata = { title: "Voucher" };

type Details = {
  hotelName?: string;
  houseName?: string;
  resort?: string | null;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  hotelCategory?: string | null;
  address?: string | null;
  destinationName?: string | null;
  hotelPhone?: string | null;
  rooms?: string[];
  board?: string;
  nights?: number;
  remarks?: string;
  notes?: string[];
  cancellation?: string;
};
type Payload = {
  reference?: string;
  referenceCode?: string | null;
  goReference?: string | null;
  hotelConfirmation?: string | null;
  payableThrough?: string | null;
  supplierVatNumber?: string | null;
  voucher?: {
    voucherUrl?: string | null;
    phone?: string | null;
    address?: string | null;
    emergencyPhone?: string | null;
    bookedAndPayableBy?: string | null;
    remarks?: string | null;
    /** Casas: códigos de acesso informados pela administradora. */
    access?: { doorCode?: string | null; gateCode?: string | null; wifiName?: string | null; wifiPassword?: string | null } | null;
  };
};

/** Nomes por quarto na mesma distribuição usada na reserva (adultos, depois crianças). */
function guestsByRoom(pax: PaxConfig, travelers: PersonData[]) {
  const adults = travelers.filter((t) => t.type !== "CHILD" && t.name?.trim());
  const kids = travelers.filter((t) => t.type === "CHILD" && t.name?.trim());
  let ai = 0;
  let ci = 0;
  return distributeRooms(pax).map((r) => ({
    adults: Array.from({ length: r.adults }, () => adults[ai++]?.name ?? "—"),
    children: r.childAges.map((age) => ({ name: kids[ci++]?.name ?? "—", age })),
  }));
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 border-b border-line py-2.5 text-[14px] last:border-0 print:py-1.5">
      <dt className="font-semibold text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

export default async function VoucherPage({ params }: { params: Promise<{ slug: string; id: string; itemId: string }> }) {
  const { slug, id, itemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(itemId)) notFound();
  const store = await getStore(slug);
  const viewer = await viewerFor(store);
  if (!viewer) redirect(`/loja/${slug}/entrar?next=${encodeURIComponent(`/loja/${slug}/pedido/${id}/voucher/${itemId}`)}`);
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.affiliateId, store.id)));
  if (!order || (viewer.kind === "CUSTOMER" && order.customerId !== viewer.customer.id)) notFound();
  const all = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, id)).orderBy(orderItems.id);
  const [item] = await db.select().from(orderItems).where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)));
  if (!item || !["LODGING", "HOUSES", "TICKETS"].includes(item.category) || item.supplierStatus !== "CONFIRMED" || !item.supplierBookingRef) notFound();
  if (item.category === "TICKETS") return <TicketVoucher slug={slug} order={order} item={item} store={store} />;
  const house = item.category === "HOUSES";

  const d = (item.details ?? {}) as Details;
  const p = (item.supplierPayload ?? {}) as Payload;
  const ref = p.reference ?? bookingReference(order.number, all.findIndex((x) => x.id === item.id) + 1);
  const rooms = guestsByRoom(item.pax, order.travelers ?? []);
  const holder = rooms[0]?.adults[0] ?? order.customerData.name;
  const phone = d.hotelPhone ?? p.voucher?.phone ?? null;
  const address = d.address ?? p.voucher?.address ?? null;
  // nada que identifique o fornecedor para o cliente (frases com o nome dele saem)
  const remarks = [d.remarks, p.voucher?.remarks].map(stripSupplierMentions).filter(Boolean).join("\n\n");
  const notes = stripSupplierMentionsList(d.notes);
  const access = p.voucher?.access;
  const accessRows = access
    ? ([
        ["Código da porta", access.doorCode],
        ["Código do portão", access.gateCode],
        ["Wi-Fi", access.wifiName],
        ["Senha do Wi-Fi", access.wifiPassword],
      ].filter(([, v]) => !!v?.trim()) as [string, string][])
    : [];

  return (
    <main className="mx-auto max-w-[820px] px-4 py-10 sm:px-8 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <a href={`/loja/${slug}/pedido/${id}`} className="inline-flex h-9 items-center rounded-full bg-surface px-4 text-[13px] font-semibold text-ink hover:bg-surface-2">
          ← Voltar ao pedido
        </a>
        <div className="flex gap-2">
          <PrintButton />
        </div>
      </div>

      <article className="rounded-[2rem] bg-white p-6 ring-1 ring-inset ring-black/[0.08] sm:p-10 print:rounded-none print:p-0 print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div className="flex items-center gap-3">
            <StoreMark store={store} />
            <div>
              <p className="text-[15px] font-semibold text-ink">{store.name}</p>
              <p className="text-[12px] text-muted">{house ? "Voucher da casa de temporada" : "Voucher de hospedagem"}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Localizador</p>
            <p className="font-mono text-xl font-semibold text-ink">{item.supplierBookingRef}</p>
            <p className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">Reserva confirmada</p>
          </div>
        </header>

        <section className="mt-6">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-ink">{d.hotelName ?? d.houseName ?? item.title}</h1>
          {d.hotelCategory && <p className="mt-1 text-ink/70">{d.hotelCategory}</p>}
          {house && item.subtitle && <p className="mt-1 text-ink/70">{item.subtitle}</p>}
          <dl className="mt-4">
            {address && <Row label="Endereço">{address}</Row>}
            {d.resort && <Row label="Condomínio">{d.resort}</Row>}
            {d.destinationName && <Row label="Destino">{d.destinationName}</Row>}
            {phone && <Row label="Telefone do hotel">{phone}</Row>}
          </dl>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">Reserva</h2>
          <dl>
            <Row label="Check-in">
              {item.serviceDate ? date(item.serviceDate) : "—"}
              {d.checkinTime ? ` · a partir das ${d.checkinTime}` : ""}
            </Row>
            <Row label="Check-out">
              {item.serviceEndDate ? date(item.serviceEndDate) : "—"}
              {d.checkoutTime ? ` · até ${d.checkoutTime}` : ""}
            </Row>
            {d.nights ? <Row label="Noites">{d.nights}</Row> : null}
            {!house && <Row label="Quarto">{(d.rooms ?? []).join(" + ") || item.subtitle || "—"}</Row>}
            {!house && <Row label="Regime">{d.board ?? "—"}</Row>}
            <Row label="Localizador do fornecedor">
              <span className="font-mono">{item.supplierBookingRef}</span>
              {p.goReference ? <span className="text-muted"> · {p.goReference}</span> : null}
            </Row>
            {p.hotelConfirmation && (
              <Row label="Confirmação do hotel">
                <span className="font-mono">{p.hotelConfirmation}</span>
              </Row>
            )}
            <Row label="Referência da agência">
              <span className="font-mono">{ref}</span> · pedido {orderNumber(order.number)}
            </Row>
          </dl>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">Hóspedes</h2>
          <dl>
            <Row label="Titular">{holder}</Row>
            {house ? (
              <Row label="Hóspedes">
                {[item.pax.adults ? `${item.pax.adults} adulto${item.pax.adults > 1 ? "s" : ""}` : null, item.pax.children ? `${item.pax.children} criança${item.pax.children > 1 ? "s" : ""}` : null].filter(Boolean).join(" e ")}
                {(order.travelers ?? []).length > 1 ? ` — ${(order.travelers ?? []).map((t) => t.name).filter(Boolean).join(", ")}` : ""}
              </Row>
            ) : null}
            {!house && rooms.map((r, i) => (
              <Row key={i} label={`Quarto ${i + 1}`}>
                {[...r.adults, ...r.children.map((c) => `${c.name} (${c.age === 0 ? "menos de 1 ano" : `${c.age} ano${c.age > 1 ? "s" : ""}`})`)].join(", ")}
              </Row>
            ))}
          </dl>
        </section>

        {accessRows.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">Acesso à casa</h2>
            <dl>
              {accessRows.map(([label, v]) => (
                <Row key={label} label={label}>
                  <span className="font-mono">{v}</span>
                </Row>
              ))}
            </dl>
            <p className="mt-1 text-[12px] text-muted">Informado pela administradora. Os códigos podem ser atualizados por ela antes da chegada.</p>
          </section>
        )}

        {order.specialRequests && (
          <section className="mt-6">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">Pedido especial</h2>
            <p className="text-[14px] text-ink">{order.specialRequests}</p>
            <p className="mt-1 text-[12px] text-muted">Repassado ao hotel com a reserva; sujeito à disponibilidade.</p>
          </section>
        )}

        {(remarks || notes.length > 0 || d.cancellation) && (
          <section className="mt-6">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{house ? "Observações" : "Observações da tarifa"}</h2>
            {d.cancellation && <p className="text-[14px] text-ink">{/^cancelamento/i.test(d.cancellation) ? d.cancellation : `Cancelamento: ${d.cancellation}`}</p>}
            {notes.map((n) => (
              <p key={n} className="mt-1 text-[14px] text-ink">
                {n}
              </p>
            ))}
            {remarks && <p className="mt-2 whitespace-pre-line text-[13px] text-ink/80">{remarks}</p>}
          </section>
        )}

        <footer className="mt-8 space-y-2 border-t border-line pt-5 text-[12px] text-muted">
          {p.payableThrough && (
            <p className="text-ink/80">
              Payable through {p.payableThrough}, acting as agent for the service operating company, details of which can be provided upon request. VAT: {p.supplierVatNumber ?? "—"} Reference:{" "}
              {item.supplierBookingRef}
            </p>
          )}
          <p>
            {house
              ? "Guarde este voucher e tenha um documento com foto na chegada. Siga as instruções de acesso da administradora."
              : "Apresente este voucher e um documento com foto no check-in. Taxas locais indicadas acima são pagas diretamente no hotel."}
          </p>
        </footer>
      </article>
    </main>
  );
}

type TicketPayload = {
  codes?: { label: string; code: string }[];
  codeFormat?: string | null;
  travelDate?: string | null;
  vouchersReleased?: boolean;
  voucher?: { tickets?: { codes?: { label: string; code: string }[]; codeFormat?: string | null; released?: boolean } };
};

/** Voucher dos ingressos: um código (QR) por pessoa, data/horário e titular — sem marca do fornecedor. */
async function TicketVoucher({ slug, order, item, store }: { slug: string; order: typeof orders.$inferSelect; item: typeof orderItems.$inferSelect; store: Store }) {
  const p = (item.supplierPayload ?? {}) as TicketPayload;
  const d = (item.details ?? {}) as { slotFrom?: string | null; startTime?: string | null; admissionType?: string | null; cancellation?: string; notes?: string[] };
  const codes = p.voucher?.tickets?.codes ?? p.codes ?? [];
  const format = p.voucher?.tickets?.codeFormat ?? p.codeFormat ?? "QR_CODE";
  const textOnly = /^(NONE|LINK|PDF|IMAGE|OTHER)$/.test(format ?? "");
  const qrs = textOnly ? [] : await Promise.all(codes.map((c) => QRCode.toString(c.code, { type: "svg", margin: 1, width: 180 })));
  // ingresso do dia inteiro não tem horário (o fornecedor manda 00:00)
  const time = "startTime" in d ? (d.startTime ?? null) : d.admissionType === "TIME_DATE" || d.admissionType === "TIME_OPEN" ? null : ((d.slotFrom ?? "").match(/T(\d{2}:\d{2})/)?.[1] ?? null);
  const holder = (order.travelers ?? []).find((t) => t.type !== "CHILD" && t.name?.trim())?.name ?? order.customerData.name;
  const notes = stripSupplierMentionsList(d.notes);
  return (
    <main className="mx-auto max-w-[820px] px-4 py-10 sm:px-8 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <a href={`/loja/${slug}/pedido/${order.id}`} className="inline-flex h-9 items-center rounded-full bg-surface px-4 text-[13px] font-semibold text-ink hover:bg-surface-2">
          ← Voltar ao pedido
        </a>
        <PrintButton />
      </div>
      <article className="rounded-[2rem] bg-white p-6 ring-1 ring-inset ring-black/[0.08] sm:p-10 print:rounded-none print:p-0 print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div className="flex items-center gap-3">
            <StoreMark store={store} />
            <div>
              <p className="text-[15px] font-semibold text-ink">{store.name}</p>
              <p className="text-[12px] text-muted">Voucher de ingressos</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Localizador</p>
            <p className="font-mono text-xl font-semibold text-ink">{item.supplierBookingRef}</p>
            <p className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">Reserva confirmada</p>
          </div>
        </header>
        <section className="mt-6">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-ink">{item.title}</h1>
          <dl className="mt-4">
            <Row label="Data da visita">
              {item.serviceDate ? date(item.serviceDate) : "Ingresso aberto"}
              {time ? ` · ${time}` : ""}
            </Row>
            {item.location && <Row label="Local">{item.location}</Row>}
            <Row label="Titular">{holder}</Row>
            <Row label="Ingressos">
              {[item.pax.adults ? `${item.pax.adults} adulto${item.pax.adults > 1 ? "s" : ""}` : null, item.pax.children ? `${item.pax.children} criança${item.pax.children > 1 ? "s" : ""}` : null].filter(Boolean).join(" e ")}
            </Row>
            <Row label="Pedido">{orderNumber(order.number)}</Row>
          </dl>
        </section>
        <section className="mt-6">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">Códigos de entrada</h2>
          {codes.length === 0 ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-950">Os códigos de entrada ainda estão sendo liberados. Volte a esta página em instantes.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {codes.map((c, i) => (
                <div key={`${c.code}-${i}`} className="flex items-center gap-4 rounded-2xl border border-line p-4 print:break-inside-avoid">
                  {qrs[i] && <div className="h-[120px] w-[120px] shrink-0 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrs[i] }} />}
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-muted">{c.label}</p>
                    <p className="break-all font-mono text-[15px] font-semibold text-ink">{c.code}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        {(d.cancellation || notes.length > 0) && (
          <section className="mt-6">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">Observações</h2>
            {d.cancellation && <p className="text-[14px] text-ink">{/^cancelamento|reembols/i.test(d.cancellation) ? d.cancellation : `Cancelamento: ${d.cancellation}`}</p>}
            {notes.map((n) => (
              <p key={n} className="mt-1 text-[14px] text-ink">
                {n}
              </p>
            ))}
          </section>
        )}
        <footer className="mt-8 border-t border-line pt-5 text-[12px] text-muted">
          <p>Apresente os códigos na entrada (no celular ou impressos) e tenha um documento com foto. Cada código vale para uma pessoa.</p>
        </footer>
      </article>
    </main>
  );
}
