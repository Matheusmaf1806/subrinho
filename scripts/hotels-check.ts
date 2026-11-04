/**
 * Conferência ao vivo das integrações de hotel — SOMENTE LEITURA (nunca faz reserva).
 * Para cada fornecedor configurado: testa credenciais/conexão, busca um destino, abre o primeiro
 * hotel e cota o primeiro quarto (busca + valuation/checkrate).
 *
 * Uso: npm run hotels:check [-- "Destino" AAAA-MM-DD noites]
 *   ex.: npm run hotels:check -- "Orlando" 2027-03-10 4
 */
import "./env";
import { closeDb } from "../src/server/db";
import { addDays, todayLocal } from "../src/lib/tz";
import { createGgtFromEnv } from "../src/server/suppliers/ggt/adapter";
import { createHotelbedsFromEnv } from "../src/server/suppliers/hotelbeds/adapter";
import { hotelIntegrations, testHotelIntegration } from "../src/server/suppliers/hotels/admin";
import { resolveDestination } from "../src/server/suppliers/hotels/destinations";
import type { SupplierAdapter } from "../src/server/suppliers/types";

async function main() {
  const [destArg, dateArg, nightsArg] = process.argv.slice(2);
  const destination = destArg || "Orlando";
  const checkIn = dateArg || addDays(todayLocal(), 60);
  const checkOut = addDays(checkIn, Number(nightsArg) || 3);
  const pax = { adults: 2, children: 1, childrenAges: [7], rooms: 1 };
  const dest = await resolveDestination(destination);
  console.log(`Destino: ${destination} → ${dest?.key ?? "não encontrado"} · ${checkIn} a ${checkOut} · 2 adultos + 1 criança (7)\n`);

  for (const info of await hotelIntegrations()) {
    console.log(`■ ${info.name}`);
    if (!info.configured) {
      console.log(`  sem credenciais (faltam: ${info.missing.join(", ")})\n`);
      continue;
    }
    if (info.certificate) console.log(`  certificado: ${info.certificate.ok ? `ok, vence em ${info.certificate.daysLeft} dias` : info.certificate.error ?? "chave não corresponde ou vencido"}`);
    const t = await testHotelIntegration(info.code);
    console.log(`  conexão: ${t.ok ? "ok" : "FALHOU"} — ${t.message} (${t.ms} ms)`);
    if (!t.ok) continue;
    const a: SupplierAdapter | null = info.code === "GGT_BEST_BUY" ? createGgtFromEnv() : createHotelbedsFromEnv();
    if (!a) continue;
    let t0 = Date.now();
    const list = await a.search({ destination, destinationKey: dest?.key, checkIn, checkOut, pax });
    console.log(`  busca: ${list.length} hotéis (${Date.now() - t0} ms)`);
    if (!list.length) continue;
    const h = list[0];
    t0 = Date.now();
    const d = await a.getProduct(h.productId, { destination, checkIn, checkOut, pax });
    console.log(`  hotel: ${d?.title} · ${d?.options.length ?? 0} opções · ${d?.gallery?.length ?? 0} fotos (${Date.now() - t0} ms)`);
    const opt = d?.options[0];
    if (!opt) continue;
    t0 = Date.now();
    const q = await a.quote({ productId: h.productId, optionId: opt.optionId, checkIn, checkOut, pax });
    console.log(`  cotação: ${q.subtitle} · ${q.currency} ${q.lines[0].unitCost} · ${String(q.details.cancellation ?? "")} (${Date.now() - t0} ms)\n`);
  }
}

main()
  .catch((e) => {
    console.error("Erro:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
