import Link from "next/link";
import { Building2, ShieldCheck, Store } from "lucide-react";
import { FlightPath, SubrinhoLogo } from "@/components/brand";
import { ArrowChip } from "@/components/ui";
import { photo } from "@/lib/images";

export default function Home() {
  const cards = [
    { href: "/loja/viagens-da-ana", icon: Store, title: "Loja", desc: "A loja personalizada de cada agência: ingressos, hospedagem, casas, seguro e chip, em até 10x.", tone: "bg-white text-ink" },
    { href: "/afiliado", icon: Building2, title: "Painel do Afiliado", desc: "Pedidos, carrinhos, margens por categoria e por ingresso, cupons e financeiro da agência.", tone: "bg-ink text-white" },
    { href: "/subrinho", icon: ShieldCheck, title: "Painel Subrinho", desc: "A conta completa de cada pedido, margens, câmbio, cupons, repasses e relatórios.", tone: "bg-surface text-ink" },
  ];
  return (
    <main className="min-h-screen bg-white p-3 sm:p-4">
      <section className="relative overflow-hidden rounded-[2rem] bg-brand text-white sm:rounded-[2.5rem]">
        <div className="absolute inset-y-0 right-0 hidden w-[40%] lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo("heroWoman", 1200, 1400)} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand to-transparent to-35%" />
        </div>
        <FlightPath className="absolute left-[45%] top-12 hidden h-28 w-56 text-white/40 lg:block" />
        <div className="relative px-6 pb-16 pt-8 sm:px-12 sm:pb-20 lg:max-w-[64%]">
          <SubrinhoLogo tone="light" size="md" />
          <h1 className="display mt-20 text-[clamp(3.25rem,8vw,8rem)]">
            Viajar é com a gente.
            <br />A tecnologia também.
          </h1>
          <p className="mt-6 max-w-lg text-[17px] text-white/85">Seu sobrinho favorito da tecnologia: lojas de viagens personalizadas para agências.</p>
        </div>
      </section>
      <section className="mt-3 grid gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className={`group flex min-h-[320px] flex-col justify-between rounded-[2rem] p-8 ring-1 ring-inset ring-black/[0.06] transition hover:-translate-y-1 sm:rounded-[2.5rem] ${c.tone}`}>
            <div className="flex items-start justify-between">
              <c.icon className="h-7 w-7 text-brand" />
              <ArrowChip tone={c.tone.includes("bg-ink") ? "light" : "dark"} className="transition group-hover:bg-brand group-hover:text-white" />
            </div>
            <div>
              <p className="text-[2.25rem] font-semibold leading-none tracking-[-0.045em]">{c.title}</p>
              <p className="mt-3 max-w-sm text-[15px] opacity-70">{c.desc}</p>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
