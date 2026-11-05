import { db } from "@/server/db";
import { getCompanyInfo } from "@/server/settings";
import { termsOfUse } from "@/lib/legal";
import { getStore, storeBase } from "../_lib/store";
import { LegalPage } from "../_components/legal-page";
import { legalStore } from "../_lib/legal-store";

export const metadata = { title: "Termos de uso" };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const store = await getStore((await params).slug);
  const company = await getCompanyInfo(db);
  const legal = legalStore(store);
  return <LegalPage doc={termsOfUse(legal, company)} base={await storeBase(store)} />;
}
