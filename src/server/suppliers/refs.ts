/**
 * Referência neutra de produto para URLs e formulários da loja: "h1-862326" em vez de
 * "GGT_BEST_BUY/862326". O cliente e a agência nunca veem o nome nem o código do fornecedor.
 */
import { SUPPLIERS } from "./registry";

const BY_CODE = new Map(SUPPLIERS.map((s) => [s.code, s.ref]));
const BY_REF = new Map(SUPPLIERS.map((s) => [s.ref, s.code]));
const ID_RE = /^[A-Za-z0-9._~-]{1,120}$/;

export function supplierRef(supplierCode: string): string {
  const r = BY_CODE.get(supplierCode);
  if (!r) throw new Error(`Fornecedor sem referência neutra: ${supplierCode}`);
  return r;
}

export function productRef(supplierCode: string, productId: string): string {
  return `${supplierRef(supplierCode)}-${encodeURIComponent(productId)}`;
}

export function parseProductRef(ref: string | null | undefined): { supplierCode: string; productId: string } | null {
  const raw = decodeURIComponent(String(ref ?? "")).trim();
  const i = raw.indexOf("-");
  if (i <= 0) return null;
  const supplierCode = BY_REF.get(raw.slice(0, i));
  const productId = raw.slice(i + 1);
  if (!supplierCode || !ID_RE.test(productId)) return null;
  return { supplierCode, productId };
}
