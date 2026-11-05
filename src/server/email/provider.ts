/**
 * Envio de e-mail pelo Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Configuração:
 *   RESEND_API_KEY  chave da API (sem ela, nada é enviado e os e-mails ficam como "não enviado" no painel)
 *   EMAIL_FROM      remetente verificado no Resend, ex.: reservas@subrinho.com.br
 * O nome do remetente é o da loja ("Viagens da Ana <reservas@subrinho.com.br>") e a resposta vai
 * para o e-mail da agência (reply-to): o cliente conversa com a agência, nunca com a plataforma.
 */
export type OutgoingEmail = {
  id: string;
  to: string;
  toName?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
};

export type SendResult = { ok: true; providerId: string | null } | { ok: false; error: string; retry: boolean };

export type EmailSender = (msg: OutgoingEmail) => Promise<SendResult>;

export function emailConfig(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.RESEND_API_KEY?.trim().replace(/^["']|["']$/g, "");
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from, baseUrl: (env.RESEND_API_URL?.trim() || "https://api.resend.com").replace(/\/+$/, "") };
}

export function emailMissing(env: NodeJS.ProcessEnv = process.env): string[] {
  return [!env.RESEND_API_KEY?.trim() && "RESEND_API_KEY", !env.EMAIL_FROM?.trim() && "EMAIL_FROM"].filter(Boolean) as string[];
}

/** "Viagens da Ana" + reservas@x → "Viagens da Ana <reservas@x>" (sem caracteres que quebram o cabeçalho). */
export function fromHeader(name: string | null | undefined, address: string): string {
  const clean = (name ?? "").replace(/[<>"\r\n,;]/g, " ").replace(/\s+/g, " ").trim();
  return clean ? `${clean} <${address}>` : address;
}

export function resendSender(cfg: NonNullable<ReturnType<typeof emailConfig>>, fetcher: typeof fetch = fetch): EmailSender {
  return async (msg) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetcher(`${cfg.baseUrl}/emails`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          // a mesma mensagem nunca sai duas vezes, mesmo se a tentativa for repetida
          "Idempotency-Key": msg.id,
          "User-Agent": "Subrinho/1.0",
        },
        body: JSON.stringify({
          from: fromHeader(msg.fromName, cfg.from),
          to: [msg.toName ? `${msg.toName.replace(/[<>"\r\n,;]/g, " ").trim()} <${msg.to}>` : msg.to],
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (res.ok) return { ok: true, providerId: body.id ?? null };
      // 4xx (fora 429) é erro da mensagem ou da conta: tentar de novo não adianta
      return { ok: false, error: `Resend HTTP ${res.status}: ${body.message ?? body.name ?? "erro"}`, retry: res.status === 429 || res.status >= 500 };
    } catch (e) {
      return { ok: false, error: `Resend: ${(e as Error).name === "AbortError" ? "sem resposta em 15 s" : (e as Error).message}`, retry: true };
    } finally {
      clearTimeout(timer);
    }
  };
}
