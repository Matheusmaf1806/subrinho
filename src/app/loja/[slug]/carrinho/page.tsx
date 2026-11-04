import { redirect } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";
import { currentCartToken, getStore } from "../_lib/store";

export const metadata = { title: "Carrinho" };

export default async function CartRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const store = await getStore((await params).slug);
  const token = await currentCartToken(store);
  if (token) redirect(`/loja/${store.slug}/carrinho/${token}`);
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <EmptyState
        icon={<ShoppingCart className="h-12 w-12" />}
        title="Seu carrinho está vazio"
        description="Escolha ingressos, hotéis, casas, seguro viagem ou chip: tudo vai para o mesmo carrinho."
        action={<ButtonLink href={`/loja/${store.slug}`} variant="dark" size="lg">Começar a montar a viagem →</ButtonLink>}
      />
    </main>
  );
}
