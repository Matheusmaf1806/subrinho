import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { AuditTable } from "@/components/audit-table";
import { db } from "@/server/db";
import { requireAffiliateUser } from "@/server/auth/session";
import { listAudit } from "@/server/audit";

export const metadata: Metadata = { title: "Histórico" };

const PAGE = 100;

export default async function AfiliadoHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { affiliate } = await requireAffiliateUser();
  const page = Math.max(0, Number((await searchParams).p ?? 0) || 0);
  const rows = await listAudit(db, { affiliateId: affiliate.id, limit: PAGE + 1, offset: page * PAGE });
  return (
    <>
      <PageHeader title="Histórico" subtitle="Alterações da sua loja: margens, cupons, preços no checkout, marca, endereço, usuários e repasses." />
      <Card>
        <AuditTable rows={rows.slice(0, PAGE)} />
      </Card>
      <div className="mt-4 flex justify-between">
        {page > 0 ? (
          <Link href={`/afiliado/historico${page > 1 ? `?p=${page - 1}` : ""}`} className={buttonClass("ghost", "sm")}>
            ← Mais recentes
          </Link>
        ) : (
          <span />
        )}
        {rows.length > PAGE && (
          <Link href={`/afiliado/historico?p=${page + 1}`} className={buttonClass("ghost", "sm")}>
            Mais antigos →
          </Link>
        )}
      </div>
    </>
  );
}
