import { redirect } from "next/navigation";
import { photo } from "@/lib/images";
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
    <main className="mx-auto grid max-w-[1440px] gap-3 px-3 pt-3 sm:px-4 lg:grid-cols-2">
      <div className="flex flex-col justify-center px-3 py-10 sm:px-10 lg:py-16">
        <h1 className="display text-[clamp(2.75rem,5vw,4.75rem)] text-ink">Entre na {store.name}.</h1>
        <p className="mt-4 max-w-md text-[17px] text-muted">Acompanhe seus pedidos e finalize compras mais rápido.</p>
        <div className="mt-10 max-w-lg">
          <CustomerAuth
            login={customerLoginAction.bind(null, slug)}
            register={customerRegisterAction.bind(null, slug)}
            agency={agencyLoginAction.bind(null, slug)}
            next={next}
            initial={sp.modo === "agencia" ? "agency" : "login"}
          />
        </div>
      </div>
      <div className="relative hidden min-h-[720px] overflow-hidden rounded-[2.5rem] bg-accent lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo("heroMan", 1200, 1500)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <p className="display text-[clamp(3rem,5vw,5rem)]">
            Viaje mais.
            <br />
            Pague em 10x.
          </p>
        </div>
      </div>
    </main>
  );
}
