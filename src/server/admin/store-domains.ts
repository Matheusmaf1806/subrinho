/**
 * Endereço da loja (subdomínio da plataforma e domínio próprio): gravação com validação e verificação
 * de que o domínio próprio já chega na loja certa (só então ele vira o endereço oficial).
 */
import { and, eq, ne } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliates } from "@/server/db/schema";
import { checkCustomDomain, checkSubdomain, domainConfig } from "@/lib/store-domains";

export class StoreDomainError extends Error {}

export async function updateStoreDomains(tx: Tx, affiliateId: string, input: { subdomain: string; customDomain: string }) {
  const cfg = domainConfig();
  const sub = checkSubdomain(input.subdomain);
  if ("error" in sub) throw new StoreDomainError(sub.error);
  const custom = checkCustomDomain(input.customDomain, cfg);
  if ("error" in custom) throw new StoreDomainError(custom.error);

  const [taken] = await tx.select({ id: affiliates.id }).from(affiliates).where(and(eq(affiliates.subdomain, sub.value), ne(affiliates.id, affiliateId)));
  if (taken) throw new StoreDomainError(`O subdomínio "${sub.value}" já é de outra loja`);
  if (custom.value) {
    const [used] = await tx.select({ id: affiliates.id }).from(affiliates).where(and(eq(affiliates.customDomain, custom.value), ne(affiliates.id, affiliateId)));
    if (used) throw new StoreDomainError(`O domínio ${custom.value} já está ligado a outra loja`);
  }
  const [cur] = await tx.select({ customDomain: affiliates.customDomain, verifiedAt: affiliates.customDomainVerifiedAt }).from(affiliates).where(eq(affiliates.id, affiliateId));
  if (!cur) throw new StoreDomainError("Loja não encontrada");
  // domínio novo precisa ser verificado de novo antes de virar o endereço oficial
  const verifiedAt = custom.value && custom.value === cur.customDomain ? cur.verifiedAt : null;
  const [row] = await tx
    .update(affiliates)
    .set({ subdomain: sub.value, customDomain: custom.value, customDomainVerifiedAt: verifiedAt })
    .where(eq(affiliates.id, affiliateId))
    .returning();
  return row;
}

export type DomainCheck = { ok: boolean; message: string };

/** Pergunta ao próprio domínio qual loja ele serve (rota /api/public/loja, que lê o endereço da requisição). */
export async function verifyCustomDomain(
  tx: Tx,
  affiliateId: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<DomainCheck> {
  const [a] = await tx.select().from(affiliates).where(eq(affiliates.id, affiliateId));
  if (!a) throw new StoreDomainError("Loja não encontrada");
  if (!a.customDomain) return { ok: false, message: "Cadastre o domínio próprio antes de verificar" };
  const url = `https://${a.customDomain}/api/public/loja`;
  let answer: { id?: string } | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetcher(url, { signal: ctrl.signal, cache: "no-store", headers: { Accept: "application/json" } }).finally(() => clearTimeout(t));
    answer = res.ok ? ((await res.json().catch(() => null)) as { id?: string } | null) : null;
    if (!res.ok && !answer) {
      return { ok: false, message: `O domínio respondeu, mas ainda não pela loja (HTTP ${res.status}). Confira se ele foi adicionado ao projeto na Vercel.` };
    }
  } catch {
    return { ok: false, message: `${a.customDomain} ainda não responde. Confira o DNS (pode levar até algumas horas para propagar).` };
  }
  if (answer?.id !== a.id) return { ok: false, message: "O domínio chega na plataforma, mas não nesta loja. Confira se ele não está cadastrado em outra loja." };
  await tx.update(affiliates).set({ customDomainVerifiedAt: new Date() }).where(eq(affiliates.id, affiliateId));
  return { ok: true, message: `Pronto: ${a.customDomain} já abre a loja e passa a ser o endereço oficial.` };
}
