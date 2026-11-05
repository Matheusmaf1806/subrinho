/**
 * Código curto do motivo de uma falha de fornecedor, mostrado na tela de erro da loja ("Código para o
 * suporte"). Não revela o fornecedor nem detalhes da resposta, mas diz à equipe o que aconteceu sem
 * precisar abrir os logs da Vercel:
 *   F403  bloqueado pelo firewall (Cloudflare) do fornecedor, com o HTTP devolvido; "c" = desafio
 *         anti-robô em vez de bloqueio, e o Ray ID que o fornecedor usa para achar o evento
 *   K401  chave/credencial recusada
 *   T     sem resposta no tempo limite
 *   N-…   falha de conexão (DNS, TLS, conexão recusada…), com o código do Node
 *   H…    resposta HTTP inesperada (H503, H200.50001 = HTTP 200 com código de erro do fornecedor)
 *   S     erro de negócio do fornecedor
 *   X-…   erro inesperado no nosso código
 */
import { SupplierError, SupplierIntegrationError } from "./types";

export function failureCode(e: unknown): string {
  if (e instanceof SupplierIntegrationError) {
    const d = e.detail ?? {};
    if (d.timeout) return "T";
    const status = typeof d.status === "number" ? d.status : null;
    if (status !== null) {
      if (d.cloudflare || /cloudflare/i.test(e.message)) return `F${status}${d.cloudflare === "challenge" ? "c" : ""}${typeof d.ray === "string" ? ` Ray ${d.ray}` : ""}`;
      if (status === 401 || d.code === 401) return "K401";
      return `H${status}${typeof d.code === "number" && d.code !== status ? `.${d.code}` : ""}`;
    }
    const net = e.message.match(/falha de conex[aã]o \(([A-Z0-9_]+)\)/);
    if (net) return `N-${net[1]}`;
    if (/conex/i.test(e.message)) return "N";
    return "I";
  }
  if (e instanceof SupplierError) return "S";
  return `X-${e instanceof Error ? e.name : typeof e}`;
}
