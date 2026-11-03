import { Receipt } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui";

export default function PedidoNaoEncontrado() {
  return (
    <Card>
      <EmptyState
        icon={<Receipt className="h-10 w-10" aria-hidden />}
        title="Pedido não encontrado"
        description="Este pedido não existe ou não pertence à sua loja."
        action={<ButtonLink href="/afiliado/pedidos">Ver todos os pedidos</ButtonLink>}
      />
    </Card>
  );
}
