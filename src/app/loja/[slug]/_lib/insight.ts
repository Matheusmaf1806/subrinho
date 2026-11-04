/**
 * O que a loja mostra a mais para quem está logado com permissão. Decidido só no servidor:
 *  - fornecedor de cada oferta → só o super admin da Subrinho (perfil OWNER, sessão do Painel Subrinho)
 *    e nunca enquanto houver sessão de agência no mesmo navegador (loja ou Painel do Afiliado);
 *  - comissão da agência → usuário ADMIN da PRÓPRIA agência (logado na loja ou no Painel do Afiliado).
 * Cliente, outra agência, AGENTE e visitante recebem { supplier: false, commission: false } e esses
 * dados nem entram na página. As páginas que usam isto leem cookies, então nunca são cacheadas
 * para outra pessoa.
 */
import "server-only";
import { cache } from "react";
import { currentAffiliateUser, currentSubrinhoUser, storeViewer } from "@/server/auth/session";
import type { Reveal } from "@/server/catalog";

export const storeInsight = cache(async (storeId: string): Promise<Reveal> => {
  const [sub, viewer, panel] = await Promise.all([currentSubrinhoUser(), storeViewer(storeId), currentAffiliateUser()]);
  // navegando como agência (mesmo que a sessão Subrinho também exista): agência nunca vê o fornecedor
  const asAffiliate = viewer?.kind === "AFFILIATE" || !!panel;
  const supplier = !!sub && sub.role === "OWNER" && !asAffiliate;
  const commission = (viewer?.kind === "AFFILIATE" && viewer.canAdmin) || (!!panel && panel.affiliate.id === storeId && panel.user.role === "ADMIN");
  return { supplier, commission };
});
