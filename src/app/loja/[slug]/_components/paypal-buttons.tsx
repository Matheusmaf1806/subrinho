"use client";

/**
 * Botões do PayPal (cartão ou conta PayPal). O pedido no PayPal é criado no servidor com o valor do
 * nosso pedido; aqui só circula o id. Depois da aprovação, o servidor captura e confere o valor.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { capturePaypalAction, startPaypalAction } from "../actions";

type PaypalNamespace = {
  Buttons: (o: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; close?: () => Promise<void>; isEligible?: () => boolean };
};

const loaders = new Map<string, Promise<PaypalNamespace>>();

function loadSdk(clientId: string): Promise<PaypalNamespace> {
  const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=BRL&intent=capture&locale=pt_BR&components=buttons&commit=true`;
  const cached = loaders.get(src);
  if (cached) return cached;
  const p = new Promise<PaypalNamespace>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => {
      const pp = (window as unknown as { paypal?: PaypalNamespace }).paypal;
      if (pp) resolve(pp);
      else reject(new Error("PayPal indisponível"));
    };
    s.onerror = () => {
      loaders.delete(src);
      reject(new Error("Não foi possível carregar o PayPal"));
    };
    document.head.appendChild(s);
  });
  loaders.set(src, p);
  return p;
}

export function PaypalButtons({ clientId, slug, orderId }: { clientId: string; slug: string; orderId: string }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let buttons: { close?: () => Promise<void> } | null = null;
    loadSdk(clientId)
      .then(async (paypal) => {
        if (cancelled || !box.current) return;
        const b = paypal.Buttons({
          style: { layout: "vertical", shape: "pill", color: "gold", label: "pay", height: 48 },
          createOrder: async () => {
            setError(null);
            setInfo(null);
            const r = await startPaypalAction(slug, orderId);
            if (!r.id) {
              setError(r.error ?? "Não conseguimos abrir o PayPal agora.");
              throw new Error(r.error ?? "sem pedido");
            }
            return r.id;
          },
          onApprove: async (data: { orderID: string }, actions: { restart: () => Promise<void> }) => {
            setBusy(true);
            try {
              const r = await capturePaypalAction(slug, orderId, data.orderID);
              if (r.retry) {
                setInfo(r.message ?? null);
                return actions.restart();
              }
              if (r.ok || r.pending) {
                if (r.pending) setInfo(r.message ?? null);
                router.refresh();
                return;
              }
              setError(r.error ?? "Não conseguimos confirmar o pagamento.");
            } finally {
              setBusy(false);
            }
          },
          onCancel: () => setInfo("Pagamento não concluído. Quando quiser, é só clicar de novo."),
          onError: () => setError((e) => e ?? "O PayPal não respondeu. Tente novamente em instantes."),
        });
        buttons = b;
        await b.render(box.current);
        if (!cancelled) setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      buttons?.close?.().catch(() => undefined);
    };
  }, [clientId, slug, orderId, router]);

  return (
    <div className="space-y-3">
      {!ready && !error && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando o PayPal…
        </p>
      )}
      <div ref={box} className={busy ? "pointer-events-none opacity-50" : undefined} />
      {busy && (
        <p className="flex items-center gap-2 text-sm font-semibold text-ink" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Confirmando o pagamento…
        </p>
      )}
      {info && <p className="rounded-xl bg-surface px-4 py-3 text-sm text-ink">{info}</p>}
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">
          {error}
        </p>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Pagamento processado pelo PayPal. Não vemos nem guardamos os dados do seu cartão.
      </p>
    </div>
  );
}
