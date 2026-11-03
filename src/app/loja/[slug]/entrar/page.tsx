import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getStore, safeNext, viewerFor } from "../_lib/store";
import { CustomerAuth } from "../_components/auth-forms";
import { agencyLoginAction, customerLoginAction, customerRegisterAction } from "../actions";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string; modo?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const store = await getStore(slug);
  const viewer = await viewerFor(store);
  const next = safeNext(store, sp.next);
  if (viewer) redirect(next);
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-black tracking-tight text-ink">Entrar na {store.name}</h1>
      <p className="mt-1 text-muted">Acompanhe seus pedidos e finalize compras mais rápido.</p>
      <Card className="mt-6 p-5">
        <CustomerAuth
          login={customerLoginAction.bind(null, slug)}
          register={customerRegisterAction.bind(null, slug)}
          agency={agencyLoginAction.bind(null, slug)}
          next={next}
          initial={sp.modo === "agencia" ? "agency" : "login"}
        />
      </Card>
    </main>
  );
}
