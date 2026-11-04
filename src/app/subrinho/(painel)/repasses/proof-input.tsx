"use client";

/** Seleção de comprovantes com validação no navegador (tipo, 8 MB por arquivo e limite do envio). */
import { useState } from "react";
import { inputClass, cn } from "@/components/ui";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp";
const MAX_FILE = 8 * 1024 * 1024;
const MAX_TOTAL = 9.5 * 1024 * 1024; // limite de corpo das Server Actions é 10 MB
const OK_EXT = /\.(pdf|png|jpe?g|webp)$/i;

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

export function ProofInput({ required, id }: { required?: boolean; id: string }) {
  const [info, setInfo] = useState<{ text: string; error: boolean } | null>(null);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        Comprovante(s) {required ? "*" : <span className="font-semibold text-muted">(opcional)</span>}
      </label>
      <input
        id={id}
        type="file"
        name="files"
        multiple
        accept={ACCEPT}
        required={required}
        className={cn(inputClass, "file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700")}
        onChange={(e) => {
          const el = e.currentTarget;
          const files = [...(el.files ?? [])];
          let msg = "";
          const total = files.reduce((s, f) => s + f.size, 0);
          const bad = files.find((f) => !OK_EXT.test(f.name));
          const big = files.find((f) => f.size > MAX_FILE);
          if (bad) msg = `${bad.name}: envie PDF, PNG, JPG ou WEBP`;
          else if (big) msg = `${big.name} tem ${mb(big.size)}, o máximo é 8 MB por arquivo`;
          else if (total > MAX_TOTAL) msg = `Total de ${mb(total)}, envie no máximo 9,5 MB por vez (anexe em partes)`;
          else if (files.length > 10) msg = "Envie no máximo 10 arquivos por vez";
          el.setCustomValidity(msg);
          setInfo(files.length ? { text: msg || `${files.length} arquivo(s) · ${mb(total)}`, error: !!msg } : null);
        }}
      />
      <p className={cn("mt-1 text-xs", info?.error ? "font-semibold text-red-600" : "text-muted")} aria-live="polite">
        {info?.text ?? "PDF, PNG, JPG ou WEBP · até 8 MB cada · vários arquivos permitidos"}
      </p>
    </div>
  );
}
