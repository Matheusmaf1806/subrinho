import type { Metadata } from "next";
import Link from "next/link";
import { Card, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { AuditTable } from "@/components/audit-table";
import { db } from "@/server/db";
import { affiliates } from "@/server/db/schema";
import { requireSubrinhoUser } from "@/server/auth/session";
import { listAudit } from "@/server/audit";

export const metadata: Metadata = { title: "Histórico" };

const PAGE = 100;

export default async function SubrinhoHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSubrinhoUser();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.p ?? 0) || 0);
  const loja = sp.loja && /^[0-9a-f-]{36}$/i.test(sp.loja) ? sp.loja : null;
  const q = (sp.q ?? "").trim();
  const [rows, stores] = await Promise.all([listAudit(db, { affiliateId: loja, q, limit: PAGE + 1, offset: page * PAGE }), db.select({ id: affiliates.id, name: affiliates.name }).from(affiliates).orderBy(affiliates.name)]);
  const names = Object.fromEntries(stores.map((s) => [s.id, s.name]));
  const qs = (p: number) => `/subrinho/historico?${new URLSearchParams({ ...(q ? { q } : {}), ...(loja ? { loja } : {}), ...(p ? { p: String(p) } : {}) })}`;
  return (
    <>
      <PageHeader title="Histórico" subtitle="Quem mudou o quê e quando: margens, cupons, preços no checkout, emissões, repasses, lojas, usuários e configurações." />
      <form className="mb-4 flex flex-wrap gap-2" action="/subrinho/historico">
        <Input name="q" defaultValue={q} placeholder="Buscar (pessoa, ação, cupom…)" className="max-w-xs" aria-label="Buscar no histórico" />
        <Select name="loja" defaultValue={loja ?? ""} className="max-w-xs" aria-label="Loja">
          <option value="">Todas as lojas e a plataforma</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <button className={buttonClass("outline", "md")}>Filtrar</button>
      </form>
      <Card>
        <AuditTable rows={rows.slice(0, PAGE)} storeNames={names} />
      </Card>
      <div className="mt-4 flex justify-between">
        {page > 0 ? (
          <Link href={qs(page - 1)} className={buttonClass("ghost", "sm")}>
            ← Mais recentes
          </Link>
        ) : (
          <span />
        )}
        {rows.length > PAGE && (
          <Link href={qs(page + 1)} className={buttonClass("ghost", "sm")}>
            Mais antigos →
          </Link>
        )}
      </div>
    </>
  );
}
