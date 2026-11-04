/**
 * O que a loja mostra a mais para quem está logado com permissão. Decidido só no servidor:
 *  - fornecedor de cada oferta → equipe Subrinho com perfil OWNER ou ADMIN (sessão do Painel Subrinho);
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
  const supplier = !!sub && (sub.role === "OWNER" || sub.role === "ADMIN");
  const commission = (viewer?.kind === "AFFILIATE" && viewer.canAdmin) || (!!panel && panel.affiliate.id === storeId && panel.user.role === "ADMIN");
  return { supplier, commission };
});
