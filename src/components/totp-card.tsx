/** Cartão "Verificação em duas etapas" (Painel Subrinho e Painel do Afiliado). */
import QRCode from "qrcode";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ui-client";
import { openSecret, otpauthUrl } from "@/server/auth/totp";
import { dateTime } from "@/lib/format";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export async function TotpCard({
  user,
  issuer,
  why,
  start,
  confirm,
  disable,
}: {
  user: { email: string; totpSecret: string | null; totpEnabledAt: Date | null };
  issuer: string;
  why: string;
  start: Action;
  confirm: Action;
  disable: Action;
}) {
  const pending = !user.totpEnabledAt ? openSecret(user.totpSecret) : null;
  const qr = pending ? await QRCode.toString(otpauthUrl(user.email, pending, issuer), { type: "svg", margin: 1, width: 200 }) : null;
  return (
    <Card>
      <CardHeader
        title="Verificação em duas etapas"
        subtitle="Google Authenticator, Microsoft Authenticator, 1Password ou outro app de códigos"
        actions={user.totpEnabledAt ? <Badge tone="success">Ligada</Badge> : <Badge tone="warning">Desligada</Badge>}
      />
      <CardBody className="space-y-5 py-5">
        {user.totpEnabledAt ? (
          <>
            <p className="flex items-center gap-2 text-[15px] text-ink">
              <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden /> Ligada desde {dateTime(user.totpEnabledAt)}. Cada login pede o código do app.
            </p>
            <ActionForm action={disable} className="flex max-w-md flex-wrap items-end gap-3">
              <Field label="Para desligar, digite o código atual" className="flex-1">
                <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required placeholder="000000" />
              </Field>
              <SubmitButton variant="outline">Desligar</SubmitButton>
            </ActionForm>
          </>
        ) : pending && qr ? (
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <div className="rounded-2xl bg-white p-2 ring-1 ring-line" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR Code para o app autenticador" />
            <div className="space-y-4">
              <ol className="list-decimal space-y-1.5 pl-5 text-[14px] text-ink">
                <li>No app autenticador, toque em adicionar conta e leia o QR Code.</li>
                <li>
                  Sem câmera? Digite a chave: <code className="break-all rounded bg-surface px-1.5 py-0.5 text-[13px]">{pending.replace(/(.{4})/g, "$1 ").trim()}</code>
                </li>
                <li>Digite abaixo o código de 6 dígitos que aparece no app.</li>
              </ol>
              <ActionForm action={confirm} className="flex max-w-md flex-wrap items-end gap-3">
                <Field label="Código do app" className="flex-1">
                  <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required placeholder="000000" />
                </Field>
                <SubmitButton>Ligar verificação</SubmitButton>
              </ActionForm>
            </div>
          </div>
        ) : (
          <>
            <Alert tone="warning">
              <span className="inline-flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden /> {why}
              </span>
            </Alert>
            <ActionForm action={start}>
              <SubmitButton>Começar</SubmitButton>
            </ActionForm>
          </>
        )}
      </CardBody>
    </Card>
  );
}
