"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui-client";
import { db } from "@/server/db";
import { requireSubrinhoUser } from "@/server/auth/session";
import { attachPayoutProof, markPayoutPaid, MAX_PROOF_BYTES, PROOF_MIME } from "@/server/payouts/service";
import { payoutExists } from "@/server/subrinho/payouts";
import { brl } from "@/lib/format";
import { actionError, FormError, optText, uuid } from "../../_lib/form";
import { PERMS } from "../../_lib/labels";

const MAX_FILES = 10;
const EXT_MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

type Upload = { filename: string; mimeType: string; data: Buffer };

/** Lê e valida os arquivos enviados no campo "files". */
async function readProofs(fd: FormData): Promise<Upload[]> {
  const files = fd.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
  if (files.length > MAX_FILES) throw new FormError(`Envie no máximo ${MAX_FILES} arquivos por vez`);
  const out: Upload[] = [];
  for (const f of files) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = PROOF_MIME.includes(f.type) ? f.type : (EXT_MIME[ext] ?? f.type);
    if (!PROOF_MIME.includes(mimeType)) throw new FormError(`${f.name}: envie PDF, PNG, JPG ou WEBP`);
    if (f.size > MAX_PROOF_BYTES) throw new FormError(`${f.name}: arquivo maior que 8 MB`);
    const filename = f.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200) || `comprovante.${ext || "pdf"}`;
    out.push({ filename, mimeType, data: Buffer.from(await f.arrayBuffer()) });
  }
  return out;
}

function revalidatePayouts() {
  revalidatePath("/subrinho/repasses");
  revalidatePath("/subrinho");
  revalidatePath("/subrinho/afiliados", "layout");
  revalidatePath("/subrinho/relatorios", "layout");
}

export async function markPayoutPaidAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.payouts);
    const payoutId = uuid(fd, "payoutId", "Repasse");
    const note = optText(fd, "note")?.slice(0, 1000) ?? null;
    const current = await payoutExists(db, payoutId);
    if (!current) throw new FormError("Repasse não encontrado");
    if (current.status === "PAID") throw new FormError("Este repasse já está marcado como pago");
    if (current.status === "CANCELLED") throw new FormError("Repasse cancelado não pode ser pago");
    const proofs = await readProofs(fd);
    const p = await db.transaction(async (tx) => {
      const paid = await markPayoutPaid(tx, payoutId, user.id, note);
      for (const f of proofs) await attachPayoutProof(tx, payoutId, f, user.id, note);
      return paid;
    });
    revalidatePayouts();
    return {
      ok: true,
      message: `Repasse de ${brl(p.amount)} marcado como pago${proofs.length ? ` com ${proofs.length} comprovante(s)` : ""}.`,
    };
  } catch (e) {
    return actionError(e);
  }
}

export async function uploadPayoutProofAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireSubrinhoUser(PERMS.payouts);
    const payoutId = uuid(fd, "payoutId", "Repasse");
    const note = optText(fd, "note")?.slice(0, 1000) ?? null;
    if (!(await payoutExists(db, payoutId))) throw new FormError("Repasse não encontrado");
    const proofs = await readProofs(fd);
    if (!proofs.length) throw new FormError("Selecione ao menos um arquivo");
    await db.transaction(async (tx) => {
      for (const f of proofs) await attachPayoutProof(tx, payoutId, f, user.id, note);
    });
    revalidatePayouts();
    return { ok: true, message: `${proofs.length} comprovante(s) anexado(s).` };
  } catch (e) {
    return actionError(e);
  }
}
