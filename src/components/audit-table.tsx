/** Tabela do histórico de alterações (Painel Subrinho e Painel do Afiliado). */
import { History } from "lucide-react";
import { Badge, EmptyState, Table, Td, Th, THead, Tr } from "@/components/ui";
import { dateTime } from "@/lib/format";
import type { auditLog } from "@/server/db/schema";

const ACTOR: Record<string, string> = { SUBRINHO: "Subrinho", AFFILIATE: "Agência", CUSTOMER: "Cliente", SYSTEM: "Sistema" };

function Diff({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {}).filter(([, v]) => v && typeof v === "object" && "para" in (v as object));
  if (!entries.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted">
      {entries.slice(0, 6).map(([k, v]) => {
        const d = v as { de: unknown; para: unknown };
        const show = (x: unknown) => (x === null || x === undefined || x === "" ? "vazio" : String(x).slice(0, 60));
        return (
          <li key={k}>
            {k}: {show(d.de)} → {show(d.para)}
          </li>
        );
      })}
    </ul>
  );
}

export function AuditTable({ rows, storeNames }: { rows: (typeof auditLog.$inferSelect)[]; storeNames?: Record<string, string> }) {
  if (!rows.length) return <EmptyState icon={<History className="h-10 w-10" aria-hidden />} title="Nada registrado ainda" description="Cada alteração feita nos painéis aparece aqui, com quem fez e quando." />;
  return (
    <Table>
      <THead>
        <tr>
          <Th>Quando</Th>
          <Th>Quem</Th>
          {storeNames && <Th>Loja</Th>}
          <Th>O que mudou</Th>
        </tr>
      </THead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.id}>
            <Td className="whitespace-nowrap">{dateTime(r.createdAt)}</Td>
            <Td>
              <span className="font-semibold">{r.actorName ?? "-"}</span>
              <span className="mt-0.5 block">
                <Badge tone={r.actorType === "SUBRINHO" ? "dark" : r.actorType === "AFFILIATE" ? "brand" : "neutral"}>{ACTOR[r.actorType] ?? r.actorType}</Badge>
              </span>
            </Td>
            {storeNames && <Td className="text-muted">{r.affiliateId ? (storeNames[r.affiliateId] ?? "-") : "Plataforma"}</Td>}
            <Td className="max-w-[40rem]">
              <span className="text-sm">{r.summary}</span>
              <span className="block font-mono text-[11px] text-muted">{r.action}</span>
              <Diff data={r.data} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
