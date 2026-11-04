# Regras de negócio — Subrinho

Este documento descreve **como o sistema calcula e decide** cada coisa. Cada regra aponta para o arquivo
onde ela está implementada e para o teste que a garante.

## 1. Formação de preço (todo item, toda categoria)

> `src/server/pricing/engine.ts` · testes: `tests/pricing.test.ts`

1. **Identificar a moeda** que vem da API do fornecedor (BRL, USD ou EUR). A moeda vem em cada cotação
   (`Quote.currency`), não é fixa por fornecedor — ex.: a RateHawk pode cotar em BRL.
2. **Custo na moeda** = Σ (preço unitário × quantidade) — ex.: adulto × 5 + criança × 2.
3. **Custo R$** = custo na moeda × câmbio (Dólar/Euro “Poolvo”, dinâmico). Em BRL não há câmbio.
4. **NET Subrinho** = Custo R$ / (1 − margem Subrinho)
5. **NET Afiliado** = NET Subrinho / (1 − margem do afiliado) → **preço no Pix**
6. **PARCELADO** = NET Afiliado / (1 − taxa do parcelado) → **10x sem juros** no cartão

Exemplo da especificação (USD):

| Etapa | Conta | Resultado |
|---|---|---|
| Custo dólar | US$ 100,00 × 5 | US$ 500,00 |
| Custo R$ | 500 × 4,93 | R$ 2.465,00 |
| NET Subrinho | 2.465,00 / (1 − 4,5%) | R$ 2.581,15 |
| NET Afiliado (Pix) | 2.581,15 / (1 − 3,7%) | R$ 2.680,32 |
| Parcelado | 2.680,32 / (1 − 9,68%) | R$ 2.967,58 |

- Cada etapa é arredondada para centavos (meio para cima). O que aparece na tela é exatamente o que é somado e gravado.
- Margens e taxa nunca podem ser < 0% nem ≥ 100%.
- O parcelado é o mesmo valor total de 1x a 10x (sem juros). Parcela = total / n; a 1ª absorve os centavos.
- Câmbio: o preço usa sempre a **cotação mais recente** gravada (`fx_rates`). O pedido **congela** a cotação usada (`orders.fx_snapshot` e `order_items.fx_rate`).

## 2. Margens

> `src/server/pricing/margins.ts`, `src/server/admin/margins.ts` · testes: `tests/margins.test.ts`

Duas camadas, cada uma com suas regras: **Subrinho** e **Afiliado**. A regra mais específica vence:

`PRODUCT_OPTION` (ex.: “Coliseu + Vaticano”) > `PRODUCT` (ex.: “Coliseu”) > `SUPPLIER` > `CATEGORY` > `DEFAULT`

- O afiliado configura: margem padrão, por categoria e, para ingressos, **por tipo de ingresso**
  (ex.: Coliseu 1 dia = 10%, Coliseu + Vaticano = 12%).
- Sem regra cadastrada, vale o fallback das Configurações (`fallbackAffiliateMarginPct`).
- Margem máxima do afiliado: `maxAffiliateMarginPct` (Configurações).

### Alteração de margem no checkout (modo ADMIN)

> `setAffiliateMarginOverride` em `src/server/cart/service.ts` · modal em `src/app/loja/[slug]/_components/item-modals.tsx`

- O modal **só aparece** se o usuário estiver logado na loja **como usuário da agência** com **modo ADMIN ligado**
  (somente usuários com papel ADMIN conseguem ligar o modo ADMIN).
- Altera a margem **do afiliado** de **um item**, **somente naquele carrinho** (`cart_items.affiliate_margin_override_pct`).
- Nunca menor que 0%. O pedido grava a origem da margem (`affiliate_margin_source = OVERRIDE`).

## 3. Cupons de desconto

> `src/server/coupons/engine.ts`, `src/server/admin/coupons.ts` · testes: `tests/coupons.test.ts`

- **Camadas:** cupom da **Subrinho** desconta da margem Subrinho; cupom do **Afiliado** desconta da margem do
  afiliado. Cada um só mexe na sua margem e **nenhuma margem fica abaixo de 0%** (o desconto é limitado à margem
  disponível — o carrinho avisa “desconto limitado”). Um carrinho pode ter 1 cupom de cada camada.
- **Por categoria:** Ingressos, Hospedagem, Casas, Seguro, Chip (e as futuras). Vazio = todas.
- **Tipos:**
  - `PERCENT` — % sobre o preço Pix dos itens elegíveis;
  - `FIXED` — valor fixo em R$;
  - `CONDITIONAL` — R$ X a cada R$ Y em itens elegíveis (ex.: R$ 100 a cada R$ 10.000).
- Opcionais: compra mínima, desconto máximo, validade, limite de usos, restrição de loja (cupom Subrinho).
- O desconto total é distribuído entre os itens elegíveis proporcionalmente ao preço, respeitando o teto de
  margem de cada item (centavos exatos).
- Parcelado com cupom = (Pix com desconto) / (1 − taxa).

## 4. Carrinho

> `src/server/cart/service.ts`

- **Nunca expira.** Quem expira são os itens: quando a data do serviço chega (00h de Brasília da data do
  ingresso/check-in/início da viagem), o item é removido (`status = EXPIRED`), o usuário é avisado e os outros itens
  continuam. Chip sem data de início não expira.
- **Compartilhável:** `/loja/<slug>/carrinho/<token>`. Se o usuário estava logado ao criar, o carrinho fica vinculado
  a ele (quem gerou: cliente ou usuário da agência). Se não estava, “só cria”; se ele logar depois e continuar
  adicionando, o vínculo é registrado.
- **Acessos:** cada abertura do carrinho/checkout no navegador é registrada (`cart_views`) e contada
  (`carts.view_count`), com visitante anônimo, usuário, IP (hash) e navegador.
- **Quantidades:** adulto/criança/sênior/quartos/unidades podem ser alterados no carrinho e no checkout; o sistema
  consulta o fornecedor de novo para trazer o preço certo (ex.: +1 criança na Disney).
- Antes de cobrar, o checkout reconsulta preço/disponibilidade de todos os itens; se algo mudou, avisa e não cobra.

## 5. Pedido — o que é gravado

> `src/server/checkout/service.ts`

**Tudo**: conta (quem tem a conta) × pagador × viajantes; carrinho (criado em, quem gerou, acessos até o pedido);
para cada item a conta completa (custo na moeda, câmbio, custo R$, margens % e R$ com a regra aplicada, NETs,
descontos por camada, Pix, taxa, parcelado, valor cobrado, margens efetivas, receita Subrinho, comissão), cupons
(regra, base elegível, pedido × aplicado), câmbio, forma de pagamento, IP, navegador, eventos, reserva no fornecedor
e data de repasse.

### Quem vê o quê

| | Painel Subrinho | Painel do Afiliado | Cliente |
|---|---|---|---|
| Custo, câmbio, margem/NET Subrinho, fornecedor | ✅ | ❌ | ❌ |
| Valor pago, itens, quantidades | ✅ | ✅ | ✅ |
| Margem do afiliado (%) por item e comissão | ✅ | ✅ | ❌ |
| Cliente (conta) e pagador | ✅ | ✅ | ✅ (os próprios) |
| Data do repasse | ✅ | ✅ | ❌ |

A visão do afiliado é montada por **lista branca** de campos (`getOrderForAffiliate` em
`src/server/orders/queries.ts`) — o teste de integração garante que custo/câmbio/margem Subrinho não vazam.

## 6. Repasse ao afiliado

> `src/server/payouts/calendar.ts`, `src/server/payouts/service.ts` · testes: `tests/calendar.test.ts`

- Vendido (pago) entre os dias **1 e 15** → pago no **5º dia útil depois do dia 15**.
- Vendido do dia **16 em diante** → pago no **5º dia útil do mês seguinte**.
- A data da venda é a data do **pagamento**, no fuso de São Paulo.
- Dias úteis: segunda a sexta, exceto feriados nacionais (inclui Carnaval, Sexta-feira Santa, Corpus Christi e
  20 de novembro) e feriados extras cadastrados no Painel Subrinho.
- Exemplos: venda em 03/11/2026 → repasse 23/11/2026 (20/11 é feriado); venda em 20/11/2026 → 07/12/2026.
- Valor do repasse = Σ comissões (margem do afiliado − desconto do afiliado) dos pedidos pagos na quinzena.

### Fechamento de quinzena

- No **dia 16** fecha 1–15; no **dia 1** fecha 16–fim do mês anterior (`/api/cron/fortnight-close`, agendado em
  `vercel.json`; também há o botão no Painel Subrinho e `npm run fortnight:close`).
- Gera o relatório completo (totais, por afiliado, por categoria, por fornecedor; CSV item a item com todas as
  margens) e agenda o repasse de cada afiliado. É idempotente.
- Depois de pagar, a Subrinho marca o repasse como pago e **anexa os comprovantes** (PDF/imagem), que o afiliado
  baixa no Financeiro.

## 7. Hotéis com API real (GGT | Best Buy e Hotelbeds)

- **Ocupação:** 1 a 5 quartos, ao menos 1 adulto por quarto, até 8 hóspedes por quarto. Criança = 0 a 17 anos e a
  **idade de cada criança é obrigatória** (muda o preço). Os hóspedes são distribuídos nos quartos sempre da mesma
  forma na busca, na cotação e na reserva (adultos o mais igual possível; crianças em rodízio).
- **Preço:** o custo é o total da estadia devolvido pelo fornecedor (na moeda dele) e entra na mesma conta de todo
  item (câmbio → margem Subrinho → margem afiliado → parcelado). Ao reservar e no checkout o fornecedor é consultado
  de novo; se o preço mudou, o carrinho é atualizado e o cliente revisa antes de pagar.
- **Taxas pagas no hotel** (resort fee, city tax…) não fazem parte do preço: aparecem como aviso no quarto, no
  carrinho e na tarifa.
- **Cancelamento:** mostrado como “Cancelamento grátis até DD/MM” (dia anterior ao início da multa informada pelo
  fornecedor) ou “Não reembolsável”.
- **Hóspedes no checkout:** nome e sobrenome de todos os adultos e crianças da hospedagem (adultos com tratamento
  Sr./Sra.). Os nomes vão para a reserva sem acentos.
- **Emissão da reserva:** só depois do pagamento. Padrão: a equipe Subrinho emite no Painel (item “Aguardando
  emissão”). O sistema nunca reserva duas vezes (procura pela referência `SUB<pedido>-<item>` antes) e não reserva se o
  fornecedor pedir mais que o custo vendido — nesses casos o item fica “Falha na emissão” com o motivo, para a equipe
  resolver. Com pagamento simulado nunca há emissão automática.
- **Vitrine:** numa categoria com fornecedor real, os fornecedores simulados saem da vitrine (o cliente nunca vê um
  hotel fictício ao lado de um real).

