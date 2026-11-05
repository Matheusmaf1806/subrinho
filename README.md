# Subrinho

**Seu sobrinho favorito da tecnologia.** Plataforma de viagens com três painéis:

| Painel | Para quem | Endereço |
|---|---|---|
| **Painel Subrinho** | Equipe Subrinho — vê tudo: conta completa de cada item, margens, câmbio, cupons, repasses, relatórios | `/subrinho` |
| **Painel do Afiliado** | Agência — pedidos, carrinhos, margens (por categoria e por tipo de ingresso), cupons, financeiro | `/afiliado` |
| **Loja** | Cliente final — loja personalizada de cada afiliado | `/loja/<slug-do-afiliado>` |

Três tipos de usuário: **usuário da loja** (cliente), **usuário da Subrinho** e **usuário do afiliado**
(papéis ADMIN e AGENT; o ADMIN pode entrar na loja em “modo ADMIN” e alterar margens no checkout).

Produtos: **Ingressos e Experiências** (Tu Experienza, Nadio), **Hospedagem** (GGT | Best Buy Hotels e Hotelbeds com
**API real**; RateHawk), **Casas** (Master Vacation Home e Mapro com **API real**), **Seguro Viagem** (Intermac, Hero) e **Chip** (esimx).
Em breve: Aluguel de Carro, Guiamento Remoto, Cruzeiros, Transfer e Roteirização (categorias já previstas no banco).

As regras de preço, margens, cupons, carrinho, visibilidade e repasse estão em
**[docs/regras-de-negocio.md](docs/regras-de-negocio.md)**.

## Rodando localmente

Requisitos: Node 20.9+ e PostgreSQL 14+ (ou Docker).

```bash
docker compose up -d          # PostgreSQL (opcional, se não tiver um local)
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed               # dados de demonstração
npm run dev                   # http://localhost:3000
```

Acessos do seed:

| Onde | Usuário | Senha |
|---|---|---|
| `/subrinho/login` | admin@subrinho.com.br | subrinho123 |
| `/afiliado/login` (ADMIN) | ana@viagensdaana.com.br | afiliado123 |
| `/afiliado/login` (AGENT) | bruno@viagensdaana.com.br | afiliado123 |
| `/loja/viagens-da-ana/entrar` (cliente) | maria@cliente.com.br | cliente123 |
| `/loja/viagens-da-ana/entrar?modo=agencia` (modo ADMIN) | ana@viagensdaana.com.br | afiliado123 |

Sem credenciais do PayPal (ou com `PAYMENT_PROVIDER=mock`) os pagamentos são simulados: o Pix gera um “copia e cola”
e a página do pedido tem o botão “Simular pagamento”; no cartão, qualquer número é aprovado, exceto final `0002`
(recusado). Pagamento simulado nunca emite reserva real nem gera repasse.

## Deploy na Vercel

1. **Banco:** crie um PostgreSQL (Vercel Postgres/Neon, Supabase…) e copie a URL de conexão (com `?sslmode=require`).
2. **Variáveis de ambiente** do projeto na Vercel:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | URL do PostgreSQL |
   | `APP_URL` | URL pública (ex.: `https://subrinho.vercel.app`) — usada nos links de carrinho |
   | `CRON_SECRET` | um segredo qualquer — a Vercel envia nos crons e as rotas `/api/cron/*` exigem |
   | `FX_PROVIDER` | `manual` (cotação lançada no Painel Subrinho), `awesomeapi` ou `poolvo` |
   | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | PayPal (app de produção) — liga o gateway real |
   | `PAYPAL_API_BASE` | `https://api.paypal.com` (padrão) ou `https://api-m.sandbox.paypal.com` |
   | `PAYPAL_WEBHOOK_ID` | opcional — confere a assinatura dos webhooks do PayPal |
   | `PIX_KEY`, `PIX_MERCHANT_NAME`, `PIX_MERCHANT_CITY` | Pix com confirmação manual no painel (sem `PIX_KEY`, só cartão/PayPal) |
   | `GGT_API_BASE_URL`, `GGT_AGENCY_ID`, `GGT_USER`, `GGT_PASSWORD`, `GGT_ENVIRONMENT` | GGT \| Best Buy Hotels (API real) |
   | `HB_HOTEIS_API_KEY`, `HB_HOTEIS_SECRET` | Hotelbeds: API key e secret (também aceita `API_KEY_HH` / `SECRET_KEY_HH`) |
   | `HB_HOTEIS_CLIENT_CRT`, `HB_HOTEIS_CLIENT_KEY`, `HB_HOTEIS_CA_CHAIN` | Hotelbeds: certificado mTLS, chave privada e cadeia da CA (PEM) |
   | `HOTELBEDS_ENVIRONMENT` | `production` ou `test` — o mesmo ambiente das credenciais |
   | `TUEXPERIENCIA_DISTRIBUTOR_ID`, `TUEXPERIENCIA_USERNAME`, `TUEXPERIENCIA_PASSWORD` | Tu Experienza (ingressos, API real) |
   | `MAPRO_API_TOKEN` | MAPRO (casas de temporada, API real) |
   | `MASTER_VACATION_HOME_API_KEY` | Master Vacation Home (casas em Orlando): o `uid` de parceiro das cotações. Opcionais: `MASTER_VACATION_HOME_API_URL`, `MASTER_VACATION_HOME_ICAL_URL`, `MASTER_VACATION_HOME_FREE_CANCEL_DAYS` |
   | `ESIMX_API_KEY` | eSIMX (chip eSIM): chave da página "API Key" do console. Sem ela, a categoria Chip fica "em breve". Cada eSIM é pago com o saldo pré-pago da conta |
   | `SUPPLIER_BOOKING` | `manual` (padrão — a equipe emite as reservas no Painel Subrinho) ou `auto` (só com gateway real) |
   | `RESEND_API_KEY`, `EMAIL_FROM` | E-mails automáticos (Resend): chave da API e remetente de um domínio verificado no Resend, ex.: `reservas@subrinho.com.br`. Sem eles, nenhum e-mail sai (ficam como “Não enviado” em Painel Subrinho › E-mails) |
   | `ALERT_EMAILS` | opcional — e-mails extras (separados por vírgula) para os alertas da equipe |
   | `META_GRAPH_VERSION` | opcional — versão da Graph API da Meta para a API de conversões (padrão `v22.0`) |
   | `AUTH_SECRET` | opcional — chave que cifra os segredos da verificação em duas etapas e os tokens da Meta (sem ela, deriva do `CRON_SECRET`; trocar a chave obriga a ligar a verificação e a colar os tokens de novo) |

   Não defina `SUPPLIERS_MODE=mock` em produção (isso força o catálogo simulado mesmo com credenciais).

3. **Deploy:** o script `vercel-build` aplica as migrações do banco e depois roda `next build`
   (sem `DATABASE_URL`, só avisa e segue).
4. **Dados iniciais (opcional):** no SQL Editor do Neon, cole `docs/neon/subrinho-instalar.sql` e rode — funciona com o
   banco vazio ou com as tabelas já criadas pelo deploy (veja `docs/neon/LEIA-ME.md`).
   Ou pelo terminal: `DATABASE_URL=... npm run db:seed`

**Crons (`vercel.json`):** o plano Hobby permite cron no máximo 1x por dia, então:
- fechamento de quinzena: dias 1 e 16 às 03h (Brasília);
- câmbio: 1x por dia às 07h (Brasília). Além disso, o câmbio é atualizado **sob demanda**: ao calcular preços, se a
  cotação gravada tiver mais de `FX_MAX_AGE_MINUTES` (padrão 30), o sistema busca uma nova na API configurada
  (com limite de 3 s; se a API falhar, usa a última cotação gravada). Assim o dólar continua dinâmico mesmo no Hobby.

**Uploads:** a Vercel aceita até 4,5 MB por requisição — por isso os limites são 1 MB (logos), 500 KB (ícone) e
3 MB (fotos da página inicial); fotos grandes devem ser enviadas uma de cada vez.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | TypeScript |
| `npm test` | Testes unitários (preço, margens, cupons, calendário, Pix, CPF/CNPJ) |
| `npm run test:integration` | Fluxo completo contra um PostgreSQL de teste (`TEST_DATABASE_URL`) |
| `npm run db:generate` | Gera migração a partir de `src/server/db/schema.ts` |
| `npm run db:migrate` / `db:seed` / `db:reset` | Banco |
| `npm run fx:refresh` | Atualiza o câmbio pelo provedor configurado |
| `npm run fortnight:close [AAAA-MM-DD]` | Fecha a quinzena (relatório + repasses) |
| `npm run hotels:check [-- "Destino" AAAA-MM-DD noites]` | Confere as APIs de hotel ao vivo: conexão, busca, hotel e cotação — **nunca reserva** |

## Arquitetura

```
src/
  app/
    loja/[slug]/        Loja (vitrine, listagens, detalhes, carrinho, checkout, pedido, conta)
    afiliado/           Painel do Afiliado
    subrinho/           Painel Subrinho
    api/cron/           Fechamento de quinzena e atualização de câmbio (Bearer CRON_SECRET)
    api/files/[id]      Download de comprovantes (Subrinho: todos; afiliado: só os seus)
  server/
    db/schema.ts        Modelo de dados (Drizzle/PostgreSQL)
    pricing/            Motor de preço, margens, precificação do carrinho
    coupons/            Motor de cupons
    cart/  checkout/    Carrinho e pedido/pagamento
    orders/queries.ts   Leituras — visão completa (Subrinho) e lista branca (afiliado)
    payouts/            Calendário de dias úteis, repasses, relatórios quinzenais
    suppliers/          Interface SupplierAdapter + catálogos simulados por fornecedor
    fx/                 Câmbio (provedores)
    payments/           Pix (BR Code) e provedor de pagamento
    auth/               Sessões dos 3 tipos de usuário
  components/           Kit de UI e marca
tests/                  Vitest
docs/                   Regras de negócio
```

Stack: Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4, Drizzle ORM, PostgreSQL,
decimal.js (nunca float para dinheiro), Vitest.

### White-label (cada agência com a sua marca)

A Loja e o Painel do Afiliado são **100% da agência**. Em *Minha loja* (ADMIN da agência) ou no detalhe do
afiliado no Painel Subrinho, um editor com **prévia ao vivo** define:

| O quê | Detalhes |
|---|---|
| Logo | Versão para fundo claro (topo) e para fundo escuro (rodapé e painel). Upload PNG/JPG/WEBP ou link. Sem logo, a loja mostra as **iniciais da agência** na cor principal — nunca a marca Subrinho. |
| Ícone da aba | Favicon próprio; sem ele, um monograma gerado na cor da agência (`/loja/<slug>/icone`). |
| Cores | Cor principal (qualquer cor) e cor escura (blocos, botões e textos). O texto sobre a cor principal fica branco ou preto **automaticamente** (contraste WCAG) e a cor principal usada como texto é escurecida quando necessário. A cor escura precisa ter contraste ≥ 7:1 com o branco. |
| Fonte | Moderna (Inter Tight), Geométrica (Manrope), Arredondada (Nunito) ou Elegante (Fraunces). |
| Textos e foto | O topo da página inicial é um banner de fotos de destinos com a busca (sem texto por cima). O **título** (até 3 linhas) aparece na tela de entrar e para leitores de tela/Google; o **subtítulo** é a descrição da loja no Google e no link compartilhado (sem ele, um resumo do que a loja vende); a **foto** (upload, link ou fotos prontas) aparece na tela de entrar e no link compartilhado. |
| Rodapé | Frase, Instagram, contatos. |
| “Tecnologia Subrinho” | Exibir ou ocultar — decidido pela Subrinho no Painel Subrinho. |

Como funciona: `src/lib/theme.ts` transforma a marca em variáveis CSS (`--theme-brand`, `--theme-brand-fg`,
`--theme-brand-ink`, `--theme-ink`, `--theme-font`); os tokens do Tailwind (`brand`, `accent`, `ink`, `font-sans`)
leem essas variáveis. A Subrinho (sem tema) usa o vermelho Subrinho. Uploads ficam em `files` com `is_public` e são
servidos por `/api/public/files/<id>` (só imagens, tipo conferido pelo conteúdo — SVG não é aceito).

Exemplos no seed: `/loja/viagens-da-ana` (vermelho), `/loja/rota-brasil` (verde-petróleo, fonte geométrica) e
`/loja/sol-e-mar` (amarelo + azul-marinho, fonte serifada, logo próprio, sem “tecnologia Subrinho”;
login do painel: marina@solemar.com.br / afiliado123).

### Identidade visual

- Uma cor de marca chapada (vermelho Subrinho `#E4113F`, ou a cor de cada agência) + cor escura + branco + cinza
  neutro; tipografia **Inter Tight** com títulos grandes e apertados (classe `display`); botões em pílula; cards sem
  bordas pesadas. Tokens em `src/app/globals.css`, componentes em `src/components/ui.tsx`.
- Fotos: Unsplash (licença livre, inclusive uso comercial), servidas pelo CDN `images.unsplash.com`. O mapa de fotos
  está em `src/lib/images.ts` — para trocar uma foto, troque o ID. Quando a API real de um fornecedor enviar imagens,
  elas substituem as fotos de exemplo automaticamente (`imageUrl` da cotação).

## Hotéis com API real — GGT | Best Buy e Hotelbeds

| | GGT \| Best Buy Hotels | Hotelbeds |
|---|---|---|
| API | GoGlobal (SOAP/XML), `src/server/suppliers/ggt/` | APItude (JSON) com **mTLS**, `src/server/suppliers/hotelbeds/` |
| Busca | por cidade (uma consulta por área, em paralelo) | por destino + fotos da Content API |
| Hotel | disponibilidade do hotel + descrição/fotos em português | disponibilidade + Content API (descrição, fotos, comodidades) |
| Cotação (ao reservar e no checkout) | busca de novo + *valuation* | reaproveita a disponibilidade + *CheckRate* só da tarifa `RECHECK` |
| Reserva | `BOOKING_INSERT` | `POST /bookings` (timeout de 60 s; procura antes pela nossa referência) |
| Voucher / cancelamento | `VOUCHER_DETAILS` / `BOOKING_CANCEL` | dados da reserva + texto *Payable through* / `DELETE` com simulação da multa |
| Ambiente | produção (credenciais da agência) | produção (`api-mtls.hotelbeds.com`), `sourceMarket=BR` |

**Como funciona na loja:** o campo Destino sugere cidades (destinos populares em português + as listas oficiais
dos fornecedores, baixadas sozinhas na primeira busca e atualizáveis no Painel Subrinho). Hóspedes: quartos,
adultos e a **idade de cada criança** (obrigatória — muda o preço). A página do hotel mostra fotos reais, quartos,
regime, **cancelamento grátis até a data** e **taxas pagas direto no hotel** (resort fee, city tax). No carrinho
aparecem as observações da tarifa; no checkout é pedido **nome e sobrenome de todos os hóspedes**.

**Reserva (segura):** pagamento confirmado não reserva sozinho — o item fica **“Aguardando emissão”** e a equipe
clica em **Emitir reserva** no pedido (Painel Subrinho). Antes de reservar, o sistema procura uma reserva já feita
com a nossa referência (`SUB<pedido>-<item>`) — **nunca reserva duas vezes** — e **não reserva se o fornecedor pedir
mais que o custo vendido**. Com `SUPPLIER_BOOKING=auto` e gateway de pagamento real, a emissão é automática.

**Regras de certificação da Hotelbeds seguidas:** uma disponibilidade por estadia (a página do hotel e a cotação
reaproveitam a busca); *CheckRate* só quando a tarifa é `RECHECK`, uma tarifa por chamada; comentários da tarifa
mostrados antes de pagar; **preço mínimo de venda** (`sellingRate` com `hotelMandatory`) respeitado pelo motor de
preço — a margem Subrinho sobe o mínimo necessário e cupons/margem do afiliado nunca vendem abaixo dele; tarifas
“pagamento no hotel” e de pacote ficam fora (decisão comercial — **informe a Hotelbeds**); erro 500 = tarifa não
disponível → recomeçar o fluxo (“Tentar de novo”), nunca repetir a mesma chamada; voucher com o texto obrigatório
*“Payable through … acting as agent … VAT … Reference …”*.

**Depois da reserva:** o cliente vê **“Ver voucher”** no pedido (imprimível/PDF, sem preço, com localizadores,
hóspedes por quarto, regime, observações e o pedido especial). O pedido especial digitado no checkout vai para o
hotel junto com a reserva. No Painel Subrinho, cada item tem **Atualizar status**, **Cancelar** (com simulação
da multa antes de confirmar) e o histórico completo na linha do tempo.

**Quarto que esgota na hora:** a loja mostra a mensagem com **“Atualizar opções”** e o quarto esgotado sai da
página do hotel, sem gastar uma nova busca no fornecedor.

**Diagnóstico:** Painel Subrinho → Fornecedores (modo de cada fornecedor, validade do certificado, “Testar conexão”,
“Atualizar destinos”) e `GET /api/health?fornecedores` (testa as conexões, somente leitura).

## Pagamento com PayPal (Orders API v2)

> `src/server/payments/paypal.ts` (cliente e conferência) · `src/server/payments/paypal-checkout.ts` (fluxo) ·
> `src/app/loja/[slug]/_components/paypal-buttons.tsx` · webhook `src/app/api/payments/webhook/route.ts` ·
> testes: `tests/paypal.test.ts` e `tests/integration.test.ts`

1. No checkout o cliente escolhe **Cartão de crédito ou PayPal**; o pedido é criado (preço e disponibilidade
   reconfirmados) e a página do pedido mostra os botões do PayPal (conta PayPal ou cartão de débito/crédito).
2. Ao clicar, o servidor cria o pedido no PayPal com o **valor do nosso banco** (`custom_id` = id do pedido,
   `invoice_id` = `SUB<número>`, sem dados do fornecedor). O navegador só recebe o id do PayPal.
3. Depois da aprovação, o servidor **captura** e só marca “Pago” se pedido, moeda (BRL) e valor conferirem. Cartão
   recusado → o PayPal deixa escolher outro meio na mesma janela. Captura em análise → o pedido fica aguardando e é
   confirmado sozinho quando o PayPal liberar.
4. Se o cliente aprovar e fechar a janela, a página do pedido e o webhook conferem na API do PayPal e capturam.
   Pedido cancelado/substituído ou carrinho já pago em outro pedido **nunca** é capturado.
5. O painel mostra o pedido e a captura no PayPal, o meio usado, a tarifa e o líquido. Estornos e contestações
   chegam pelo webhook como eventos na linha do tempo (o estorno em si é feito no painel do PayPal).

**Parcelamento:** quem define as parcelas sem juros é o plano de parcelamento da conta PayPal Empresa
(Configurações → Preferências de pagamento → Plano de parcelamento). Configure até `maxInstallments` (10x) para bater
com o que a loja anuncia; a tarifa do parcelamento entra no acréscimo do cartão (`installmentFeePct`).

**Webhook (recomendado):** cadastre `https://<seu-domínio>/api/payments/webhook` no app do PayPal com os eventos
`CHECKOUT.ORDER.APPROVED` e `PAYMENT.CAPTURE.*`. Com `PAYPAL_WEBHOOK_ID` a assinatura também é conferida.

## Ingressos com API real — Tu Experienza (Tue Distributor API v2.0)

`src/server/suppliers/tue/` — OAuth2 (`TUEXPERIENCIA_USERNAME`/`PASSWORD` → token Bearer) e distribuidor
(`TUEXPERIENCIA_DISTRIBUTOR_ID`); produção por padrão (`TUEXPERIENCIA_ENVIRONMENT=test` usa o sandbox).

| Etapa | Chamada |
|---|---|
| Busca | `GET /products` (todas as páginas, cache de 6 h) — só produtos simples e ativos; “Roma” encontra “Rome”, “Florença” encontra “Firenze” |
| Ingresso | produto + `GET /availability` da data: uma opção por horário, com vagas e preço infantil |
| Cotação | horário revalidado (vagas) + preço por tipo (adulto, criança…) da temporada e do horário |
| Reserva | procura pedido com a nossa referência (nunca duplica) → `POST /reservations` (bloqueio + preço do servidor conferido) → `POST /orders` `CONFIRM_RESERVATION`; sem resposta → procura antes de falhar |
| Voucher / status / cancelamento | `GET` / `DELETE /orders/{ref}` — o voucher mostra um QR code por ingresso |

Custo = preço de revenda ao distribuidor (`resale_price`); se a API não informar, o preço de venda (nunca vende
abaixo do custo) e a cotação marca `costBasis: "sales"`.

## Casas de temporada com API real — MAPRO

`src/server/suppliers/mapro/` (Channels API, token Bearer). Fluxo:

| Etapa | Chamada |
|---|---|
| Busca | `GET /v1/quote?checkin&checkout` — casas disponíveis já com o total (aluguel + taxas da administradora + impostos), por cursor; destino “Orlando” inclui Kissimmee, Davenport etc. |
| Casa | `GET /v1/properties/{id}` (fotos, quartos e camas, comodidades em português) + a cotação da busca; indisponível → `GET …/calendars` explica o motivo (ocupada / estadia mínima) |
| Cotação (carrinho e checkout) | cotação nova da casa (capacidade conferida) |
| Reserva | procura reserva igual do nosso canal (nunca duplica) → cotação nova (não reserva acima do custo vendido) → `POST /v1/reservations` |
| Status / voucher / cancelamento | `GET` / `DELETE /v1/reservations/{ULID}` — o voucher mostra endereço, horários, localizador e os códigos de acesso informados pela administradora |

A API não informa política de cancelamento: configure `MAPRO_FREE_CANCEL_DAYS` (sem ela, “Não reembolsável”). Cauções
cobradas pela administradora aparecem como “Caução (reembolsável pela administradora)”. O token da conta DEMO é
bloqueado em produção.

## Casas de temporada com API real — Master Vacation Home

`src/server/suppliers/mvh/` (rotas `api/v2` da Master, as mesmas da integração do airnext; `uid` de parceiro em
`MASTER_VACATION_HOME_API_KEY`). Fluxo:

| Etapa | Chamada |
|---|---|
| Busca | `GET /quote?ArriveDate&DepartDate` só para saber **quais** casas estão livres + `GET /getproperties` (conteúdo) → filtra destino, capacidade (`Sleeps`) e estadia mínima → `GET /quote/{id}?ArriveDate&DepartDate&Guests` de cada casa |
| Casa | conteúdo + `GET /getdescription/{id}` + `GET /getimages/{id}` + a mesma cotação da busca; indisponível → calendário iCal (`mastervh.com/{id}/airbnb/ical.ics`) explica o motivo |
| Cotação (carrinho e checkout) | `GET /quote/{id}` nova (capacidade e estadia mínima conferidas) |
| Reserva | **manual**: a API não reserva. A equipe reserva com a Master e usa “Registrar reserva” no pedido (localizador + custo confirmado) |

**Preço igual na busca, na casa e no carrinho:** a listagem da Master (`/quote` sem casa) devolve valores tabelados por
tier (casas diferentes com o mesmo número), por isso ela nunca vira preço. Cada casa é cotada individualmente e a
cotação fica numa tabela por período + hóspedes (15 min) lida pela busca e pela página da casa. A cotação do carrinho
atualiza essa tabela. Casa que a Master não cotou a tempo fica fora da busca (entra na próxima), nunca com preço
tabelado. **Cobrança:** o custo é o total da Master (aluguel − desconto + limpeza + serviço + impostos), em USD, e passa
inteiro pela conta normal (câmbio → margens → parcelado).

> Em 05/11/2026 as rotas `api/v2` respondiam 404 (o site da Master foi refeito). Se continuar assim, peça à Master o
> novo endereço/documentação e configure `MASTER_VACATION_HOME_API_URL`. “Testar conexão” em Painel Subrinho ›
> Fornecedores mostra a situação.

## Chip eSIM com API real — eSIMX (Wholesale API)

`src/server/suppliers/esimx/` (documentação no console da eSIMX, página “API docs”). Base
`https://enterprise.esimx.com/api/api/v1` (dois segmentos `api`, como diz a documentação), chave no header
`x-api-key` (`ESIMX_API_KEY`, página “API Key” do console). Valores em centavos de dólar.

| Etapa | Chamada |
|---|---|
| Destinos | `GET /area/list` + catálogo inteiro (`GET /package/list`, ~330 pacotes) para sugerir só países com cobertura; cidades conhecidas viram o país (“Paris” → França) |
| Busca | `GET /package/list?area_code=` — para um país vêm também os planos regionais que o cobrem; a loja mostra um plano por franquia × dias (o mais barato entre as “séries”); fica de fora o que exige verificação de identidade ou conta a validade desde a compra |
| Cotação (carrinho e checkout) | `GET /package/{code}` — preço atual × quantidade de chips |
| Emissão | `POST /order/purchase` com `customer_order_id` = a nossa referência (`SUB<pedido>-<posição>`): repetir a mesma referência não cobra de novo. Preço conferido antes (nunca compra acima do vendido); pago com o **saldo pré-pago** da conta |
| eSIM | `GET /order/{id}` + `GET /esim/list?order_id=` — o QR Code é gerado pela loja a partir do código LPA, com instalação de um toque no iPhone e os dados para Android; uso de dados atualizado no voucher |
| Cancelamento | `POST /esim/{id}/cancel` — só antes de ativar; devolve ao saldo a parte não usada |

**Saldo:** sem saldo a emissão falha com “Saldo insuficiente” (o item fica para emitir de novo no painel depois de
recarregar). O saldo aparece em Painel Subrinho › Fornecedores, com aviso quando está baixo.

**Cloudflare da eSIMX:** a API fica atrás do Cloudflare da eSIMX, que hoje desafia os servidores da Vercel
(desafio anti-robô, que um servidor não resolve). Quando a busca falha, a tela de erro da loja mostra um
“Código para o suporte” sem citar o fornecedor (`src/server/suppliers/failure-code.ts`): `F403c Ray <id>` é esse
desafio, com o Ray ID que a eSIMX usa para achar o evento e liberar a Wholesale API (`/api/api/v1/*`) para servidores.
Outros códigos: `K401` chave recusada, `T` sem resposta, `N-…` conexão, `H…` resposta inesperada.

## Endereço de cada loja (subdomínio ou domínio próprio, sem /loja/<slug>)

Cada loja abre no próprio endereço e todos os links dela saem sem prefixo (`/hospedagem`, `/carrinho/<token>`):

| Endereço | Exemplo | Como ligar |
|---|---|---|
| Subdomínio da plataforma | `viagensdaana.subrinho.com.br` | Uma vez só: na Vercel, adicione o domínio curinga `*.subrinho.com.br` ao projeto (exige o DNS de `subrinho.com.br` na Vercel) e defina `STORE_ROOT_DOMAIN=subrinho.com.br`. Cada loja escolhe o subdomínio em Minha loja › Endereço da loja |
| Domínio próprio | `viagensdaana.com.br` ou `loja.viagensdaana.com.br` | A agência cadastra o domínio no painel e cria o DNS (apex: `A @ 76.76.21.21` e `CNAME www cname.vercel-dns.com`; subdomínio: `CNAME loja cname.vercel-dns.com`). A equipe Subrinho adiciona o domínio ao projeto na Vercel. Depois, “Verificar domínio” confirma que ele já abre a loja |

Como funciona: `src/proxy.ts` reconhece o endereço e reescreve para a rota interna `/loja/<endereço>/…`
(`src/lib/store-domains.ts`); as páginas montam os links com `storeBase()` (vazio no endereço próprio).
Endereço oficial (painéis, link de carrinho): domínio próprio verificado > subdomínio > `/loja/<slug>`. Com
`STORE_ROOT_DOMAIN` definido, quem abre `/loja/<slug>` no navegador é levado ao subdomínio. Os painéis
(`/afiliado`, `/subrinho`) ficam no endereço da plataforma (`APP_URL`).

## E-mails, segurança, LGPD, rastreamento, histórico, monitoramento e notas fiscais

| O quê | Como funciona |
|---|---|
| **E-mails automáticos** | Fila no banco (`email_outbox`, `src/server/email/`) gravada na mesma transação do evento e enviada logo depois pelo Resend; o cron diário reenvia o que ficou para trás. Cliente: pedido com Pix, pagamento confirmado, voucher/eSIM pronto, cancelamento, nota fiscal, lembrete de carrinho, nova senha (remetente = nome da loja, resposta vai para a agência, nunca cita fornecedor). Agência: nova venda. Equipe: emitir, falha na emissão, pagamento após cancelamento, alertas. O link do e-mail abre o pedido sem login (`?k=` assinado, `src/server/order-access.ts`). Painel Subrinho › E-mails mostra tudo, com prévia e reenvio |
| **Esqueci minha senha** | Nas três áreas (`/subrinho/esqueci-senha`, `/afiliado/esqueci-senha`, `<loja>/esqueci-senha`): link por e-mail, vale 1 hora, uso único, encerra as sessões; resposta igual exista ou não a conta; no máximo 3 pedidos por hora |
| **Limite de login** | 5 erros com o mesmo e-mail em 15 min bloqueiam aquele e-mail por 15 min; 30 erros do mesmo IP bloqueiam o IP (`src/server/auth/limits.ts`, no banco: vale para todas as instâncias) |
| **Duas etapas** | App autenticador (TOTP) para a equipe (Painel Subrinho › Segurança) e para as agências (Painel do Afiliado › Segurança). Com ela ligada, o login pede o código, inclusive no “Sou da agência” dentro da loja; cada código vale uma vez e há limite de erros por pessoa. Celular perdido: um Proprietário desliga em Configurações (equipe); o ADMIN da agência em Usuários ou a equipe Subrinho na página do afiliado (agências) |
| **Páginas legais** | `<loja>/termos`, `/privacidade`, `/cancelamento` montadas com os dados da agência (razão social, CNPJ, Cadastur, endereço, observações) e da empresa da plataforma (Painel Subrinho › Configurações › Dados da empresa). São uma base em linguagem simples: revise com o jurídico antes de abrir para clientes |
| **LGPD** | Minha conta › Baixar meus dados (JSON) e Excluir minha conta (apaga os dados pessoais; os pedidos ficam pelo prazo legal) |
| **Pixel da Meta e GA4** | IDs por loja (Minha loja › Dados legais e rastreamento). Só carregam depois do “Aceitar todos” no aviso de cookies; eventos: visita, produto visto, item no carrinho, início do checkout e compra |
| **API de conversões da Meta** | Com o token da loja (Minha loja › Dados legais e rastreamento, guardado cifrado), cada compra paga vai do servidor para a Meta (`src/server/conversions/meta.ts`), mesmo se o cliente pagar o Pix e não voltar à loja. Só para quem aceitou os cookies no checkout; dados pessoais só como hash; `event_id` igual ao do Pixel (a Meta conta uma vez). Fila `conversion_events` com novas tentativas; status no pedido e no Monitoramento; botão “Testar” usa o código de teste |
| **SEO** | `robots.txt` e `sitemap.xml` por endereço (cada domínio/subdomínio de loja tem os seus) |
| **Carrinho abandonado** | Rotina diária (`/api/cron/daily`): um lembrete por carrinho, para cliente conhecido, depois de 20 h parado (até 7 dias). Em Painel do Afiliado › Carrinhos, botão “Lembrar no WhatsApp” com mensagem pronta |
| **Histórico** | `audit_log`: quem mudou margem, cupom, preço no checkout, emissão, marca, endereço, usuários, repasses, configurações e notas. Painel Subrinho › Histórico (tudo) e Painel do Afiliado › Histórico (da loja) |
| **Monitoramento** | Erros do servidor (`src/instrumentation.ts`), falhas de fornecedor e e-mails que não saíram vão para `error_events`; 3 falhas de um fornecedor em 15 min ou um erro novo de página alertam a equipe por e-mail (no máximo 1 a cada 6 h por assunto). Painel Subrinho › Monitoramento |
| **Notas fiscais** | Registro da nota (número, data, valor, PDF/XML ou link): do pedido, pela equipe no pedido (o cliente baixa na página do pedido e recebe e-mail); da comissão, pela agência em Financeiro. Painel Subrinho › Notas fiscais lista o que falta. A emissão em si continua no emissor da prefeitura ou no sistema fiscal da empresa |

## Fornecedores invisíveis na loja

A loja (e o Painel do Afiliado) nunca mostra quem é o fornecedor: URLs com referência neutra (`/hospedagem/h1-862326`),
fotos servidas pelo domínio da loja (`/m/<token cifrado>`), textos do fornecedor sem o nome dele e loja só com
fornecedores de API real (categorias sem fornecedor aparecem como “Em breve”). Detalhes em `docs/regras-de-negocio.md` §10.

## Integrações — o que falta plugar

- **Fornecedores:** GGT, Hotelbeds, Tu Experienza, MAPRO, Master Vacation Home e eSIMX já usam as APIs reais (veja acima). Os demais usam catálogo simulado com a mesma
  interface (`SupplierAdapter` em `src/server/suppliers/types.ts`: `search`, `getProduct`, `quote`, `book`). Para
  cada um, implemente o adaptador com a API dele e registre em `src/server/suppliers/registry.ts`.
- **Câmbio “Dólar Poolvo”:** `poolvoProvider` em `src/server/fx/index.ts` precisa do formato da API
  (`FX_POOLVO_URL`/`FX_POOLVO_TOKEN`). Enquanto isso, use `FX_PROVIDER=manual` (cotação informada no Painel Subrinho)
  ou `awesomeapi`.
- **Pix automático:** o Pix pelo PayPal é liberação limitada (depende da conta). Até lá, o Pix usa a chave `PIX_KEY`
  com confirmação no Painel Subrinho; um gateway de Pix entra como mais um `PaymentProvider`.
- **Agendador:** chame `/api/cron/fortnight-close` nos dias 1 e 16, `/api/cron/fx-refresh` periodicamente e
  `/api/cron/daily` uma vez por dia (já configurado em `vercel.json`; em outro host, use qualquer cron com
  `Authorization: Bearer $CRON_SECRET`).
- **Nota fiscal automática:** hoje a nota é registrada no painel. Para emitir sozinha, plugue um emissor de NFS-e
  (ex.: NFE.io, Focus NFe) em `src/server/invoices.ts`, com os dados fiscais da empresa (inscrição municipal,
  código de serviço, alíquota).
