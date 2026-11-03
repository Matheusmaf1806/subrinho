import { db } from "@/server/db";
import { refreshFxFromProvider } from "@/server/fx";
import { cronAuthorized } from "../auth";

/** Atualiza o câmbio a partir do provedor configurado (FX_PROVIDER). Agende a cada 15–60 min. */
async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await refreshFxFromProvider(db));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
