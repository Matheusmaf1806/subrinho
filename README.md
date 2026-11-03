# Subrinho

**Seu sobrinho favorito da tecnologia.** Plataforma de viagens com três painéis:

| Painel | Para quem | Endereço |
|---|---|---|
| **Painel Subrinho** | Equipe Subrinho — vê tudo: conta completa de cada item, margens, câmbio, cupons, repasses, relatórios | `/subrinho` |
| **Painel do Afiliado** | Agência — pedidos, carrinhos, margens (por categoria e por tipo de ingresso), cupons, financeiro | `/afiliado` |
| **Loja** | Cliente final — loja personalizada de cada afiliado | `/loja/<slug-do-afiliado>` |

Três tipos de usuário: **usuário da loja** (cliente), **usuário da Subrinho** e **usuário do afiliado**
(papéis ADMIN e AGENT; o ADMIN pode entrar na loja em “modo ADMIN” e alterar margens no checkout).

Produtos: **Ingressos e Experiências** (Tu Experienza, Nadio), **Hospedagem** (GGT | Best Buy Hotels, RateHawk,
Hotelbeds), **Casas** (Master Vacation Home, Mapro), **Seguro Viagem** (Intermac, Hero) e **Chip** (esimx).
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

Pagamentos estão em modo de testes (`PAYMENT_PROVIDER=mock`): o Pix gera um “copia e cola” válido e a página do
pedido tem o botão “Simular pagamento”; no cartão, qualquer número é aprovado, exceto final `0002` (recusado).

## Deploy na Vercel

1. **Banco:** crie um PostgreSQL (Vercel Postgres/Neon, Supabase…) e copie a URL de conexão (com `?sslmode=require`).
2. **Variáveis de ambiente** do projeto na Vercel:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | URL do PostgreSQL |
   | `APP_URL` | URL pública (ex.: `https://subrinho.vercel.app`) — usada nos links de carrinho |
   | `CRON_SECRET` | um segredo qualquer — a Vercel envia nos crons e as rotas `/api/cron/*` exigem |
   | `FX_PROVIDER` | `manual` (cotação lançada no Painel Subrinho), `awesomeapi` ou `poolvo` |
   | `PAYMENT_PROVIDER` | `mock` até o gateway ser integrado |

3. **Deploy:** o script `vercel-build` aplica as migrações do banco e depois roda `next build`
   (sem `DATABASE_URL`, só avisa e segue).
4. **Dados iniciais (opcional):** pelo SQL Editor do Neon, cole `docs/neon/subrinho-completo.sql` (banco vazio) ou
   `docs/neon/subrinho-somente-dados.sql` (tabelas já criadas pelo deploy) — veja `docs/neon/LEIA-ME.md`.
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
| Página inicial | Título (até 3 linhas), subtítulo, foto principal e secundária (upload, link ou fotos prontas). |
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

## Integrações — o que falta plugar

- **Fornecedores:** hoje todos usam catálogo simulado com a mesma interface que a integração real vai usar
  (`SupplierAdapter` em `src/server/suppliers/types.ts`: `search`, `getProduct`, `quote`, `book`). Para cada
  fornecedor, implemente o adaptador com a API dele e registre em `src/server/suppliers/registry.ts`. As credenciais
  esperadas estão no `.env.example`.
- **Câmbio “Dólar Poolvo”:** `poolvoProvider` em `src/server/fx/index.ts` precisa do formato da API
  (`FX_POOLVO_URL`/`FX_POOLVO_TOKEN`). Enquanto isso, use `FX_PROVIDER=manual` (cotação informada no Painel Subrinho)
  ou `awesomeapi`.
- **Gateway de pagamento:** implemente `PaymentProvider` em `src/server/payments/provider.ts` e o webhook em
  `src/app/api/payments/webhook/route.ts` chamando `markOrderPaid`.
- **Agendador:** chame `/api/cron/fortnight-close` nos dias 1 e 16 e `/api/cron/fx-refresh` periodicamente
  (já configurado em `vercel.json`; em outro host, use qualquer cron com `Authorization: Bearer $CRON_SECRET`).
