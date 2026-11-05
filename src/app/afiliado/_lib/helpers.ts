/** Utilitários do Painel do Afiliado (rótulos, links e leitura de formulários). */
import { AffiliateAdminError } from "@/server/admin/affiliates";
import { CouponAdminError } from "@/server/admin/coupons";
import { MarginError } from "@/server/admin/margins";
import { requireAffiliateUser, type AffiliateSession } from "@/server/auth/session";
import { date as fmtDate } from "@/lib/format";
import type { PersonData } from "@/server/db/schema";
import type { StoreAddress } from "@/lib/store-domains";
import { storePublicUrl } from "@/server/store-links";

// ───────── Links ─────────

export { appUrl } from "@/server/store-links";

/** Endereço oficial da loja (domínio próprio verificado, subdomínio ou /loja/<slug>). */
export function storeHref(store: StoreAddress) {
  return storePublicUrl(store);
}

export function cartShareLink(store: StoreAddress, token: string) {
  return storePublicUrl(store, `/carrinho/${token}`);
}

export function reportHref(periodStart: string) {
  return `/api/afiliado/relatorios/${periodStart}`;
}

export function fileHref(fileId: string) {
  return `/api/files/${fileId}`;
}

// ───────── Rótulos ─────────

export const ROLE_LABEL: Record<string, string> = { ADMIN: "Administrador", AGENT: "Agente" };

export function paymentLabel(method: string, installments: number) {
  if (method === "PIX") return "PIX";
  return installments > 1 ? `Cartão ${installments}x` : "Cartão à vista";
}

export const VIEW_PAGE_LABEL: Record<string, string> = {
  cart: "Página do carrinho",
  checkout: "Checkout",
  shared: "Link compartilhado",
};

export function viewerLabel(t: string | null) {
  if (t === "CUSTOMER") return "Cliente logado";
  if (t === "AFFILIATE") return "Agência";
  if (t === "SUBRINHO") return "Equipe Subrinho";
  return "Visitante";
}

export const MARGIN_SOURCE_LABEL: Record<string, string> = {
  RULE: "Regra da agência",
  OVERRIDE: "Alterada no checkout",
  FALLBACK: "Padrão da plataforma",
};

export const MARGIN_SCOPE_LABEL: Record<string, string> = {
  PRODUCT_OPTION: "Tipo de ingresso",
  PRODUCT: "Ingresso (todos os tipos)",
  SUPPLIER: "Regra especial",
  CATEGORY: "Categoria",
  DEFAULT: "Margem padrão",
  FALLBACK: "Padrão da plataforma",
};

export function bookingStatusLabel(s: string | null): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  switch ((s ?? "").toUpperCase()) {
    case "CONFIRMED":
      return { label: "Reserva confirmada", tone: "success" };
    case "PENDING":
    case "ON_REQUEST":
      return { label: "Reserva pendente", tone: "warning" };
    case "FAILED":
    case "CANCELLED":
    case "REJECTED":
      return { label: "Reserva não confirmada", tone: "danger" };
    case "":
    case "AWAITING_ISSUE":
    case "ISSUING":
      return { label: "Aguardando emissão", tone: "neutral" };
    case "BOOKING_FAILED":
    case "ISSUE_UNKNOWN":
      // a equipe Subrinho resolve; para a agência é "em processamento"
      return { label: "Reserva em processamento", tone: "warning" };
    default:
      return { label: s ?? "-", tone: "neutral" };
  }
}

export function fortnightLabel(start: string | null, end: string | null) {
  if (!start || !end) return "Quinzena em aberto";
  return `${fmtDate(start).slice(0, 5)} a ${fmtDate(end)}`;
}

/** "2026-11-23" → "nov" */
export function monthShort(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function addressLine(a: PersonData["address"]) {
  if (!a) return null;
  const street = [a.street, a.number].filter(Boolean).join(", ");
  const parts = [street, a.complement, a.district, [a.city, a.state].filter(Boolean).join("/"), a.zip, a.country].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// ───────── Validação de parâmetros ─────────

export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// ───────── Formulários / Server Actions ─────────

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}

/** Percentual: aceita "8.5" ou "8,5"; vazio → null. */
export function decimalField(fd: FormData, key: string): string | null {
  let v = str(fd, key).replace(/\s/g, "").replace(/%$/, "");
  if (!v) return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  return v;
}

/** Converte valor em R$ digitado no formato brasileiro ("10.000", "1.234,56", "1234,5", "1500.75"). */
export function parseBrMoney(raw: string): string | null {
  let v = raw.replace(/\s/g, "").replace(/^R\$/i, "");
  if (!v) return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, ""); // "10.000" = dez mil
  return v;
}

export function moneyField(fd: FormData, key: string): string | null {
  return parseBrMoney(str(fd, key));
}

/** Mensagem amigável para erros dos serviços (validações de negócio). */
export function serviceErrorMessage(e: unknown, fallback = "Não foi possível salvar. Tente novamente."): string {
  if (e instanceof MarginError || e instanceof CouponAdminError || e instanceof AffiliateAdminError) return e.message;
  console.error("[painel-afiliado]", e);
  return fallback;
}

export const ADMIN_ONLY_MESSAGE = "Apenas usuários ADMIN da agência podem fazer isso.";

/**
 * Autorização para Server Actions de escrita: exige login (redireciona) e papel ADMIN.
 * Retorna a sessão ou um ActionState de erro.
 */
export async function requireAdminForAction(): Promise<{ session: AffiliateSession } | { error: string }> {
  const session = await requireAffiliateUser();
  if (session.user.role !== "ADMIN") return { error: ADMIN_ONLY_MESSAGE };
  return { session };
}
