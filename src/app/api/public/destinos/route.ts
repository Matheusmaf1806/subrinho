/** Sugestões do campo "Destino" (hotéis): destinos populares em português + cidades dos fornecedores. */
import { suggestDestinations } from "@/server/suppliers/hotels/destinations";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 80) ?? "";
  try {
    // sem a lista de fornecedores de cada destino (o cliente nunca vê quem fornece)
    const items = (await suggestDestinations(q, 8)).map(({ key, label, detail }) => ({ key, label, detail }));
    return Response.json({ items }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  } catch {
    return Response.json({ items: [] }, { status: 200 });
  }
}
