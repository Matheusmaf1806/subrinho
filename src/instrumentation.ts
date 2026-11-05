/**
 * Erros do servidor (páginas, rotas, ações e proxy) vão para o monitoramento da plataforma
 * (Painel Subrinho › Monitoramento), com alerta por e-mail para a equipe. Ver src/server/monitoring.ts.
 */
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null;
    const [{ getDb }, { recordError }] = await Promise.all([import("@/server/db"), import("@/server/monitoring")]);
    await recordError(getDb(), {
      source: "request",
      key: `${context.routeType}:${context.routePath}`,
      message,
      digest,
      path: request.path.split("?")[0],
      data: { method: request.method, renderSource: context.renderSource ?? null },
    });
  } catch {
    /* sem banco, o erro continua nos logs da Vercel */
  }
};
