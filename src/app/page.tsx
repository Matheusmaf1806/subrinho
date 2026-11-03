import Link from "next/link";
import { Building2, ShieldCheck, Store } from "lucide-react";
import { FlightPath, SubrinhoLogo } from "@/components/brand";

export default function Home() {
  const cards = [
    { href: "/subrinho", icon: ShieldCheck, title: "Painel Subrinho", desc: "Onde a equipe Subrinho trabalha: pedidos completos, margens, câmbio, cupons, repasses e relatórios." },
    { href: "/afiliado", icon: Building2, title: "Painel do Afiliado", desc: "Onde a agência trabalha: pedidos, carrinhos, margens por categoria e por ingresso, cupons e financeiro." },
    { href: "/loja/viagens-da-ana", icon: Store, title: "Loja (exemplo)", desc: "Loja personalizada do afiliado: ingressos, hospedagem, casas, seguro viagem e chip, em até 10x." },
  ];
  return (
    <main className="min-h-screen bg-brand text-white">
      <div className="relative mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <FlightPath className="absolute right-6 top-10 hidden h-32 w-60 text-white/50 md:block" />
        <SubrinhoLogo tone="light" size="lg" />
        <h1 className="mt-10 max-w-2xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
          Viajar é com a gente.
          <br />A tecnologia também.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-white/85">Seu sobrinho favorito da tecnologia: lojas de viagens personalizadas para agências, com a tecnologia Subrinho.</p>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="group rounded-3xl bg-white p-6 text-ink shadow-xl shadow-black/10 transition hover:-translate-y-1">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand group-hover:bg-brand group-hover:text-white">
                <c.icon className="h-6 w-6" />
              </span>
              <p className="mt-4 text-xl font-black">{c.title}</p>
              <p className="mt-1 text-sm text-muted">{c.desc}</p>
              <p className="mt-4 text-sm font-extrabold text-brand">Acessar →</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
