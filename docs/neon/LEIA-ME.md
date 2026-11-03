# Carregar o banco no Neon (sem terminal)

1. Neon → seu projeto → **Tables**. Veja se já existem tabelas (`affiliates`, `orders`…).
2. Abra o **SQL Editor**, apague o texto de exemplo e cole **um** dos arquivos:
   - **Nenhuma tabela** → `subrinho-completo.sql` (cria as tabelas e coloca os dados de exemplo)
   - **Tabelas já existem e estão vazias** (o deploy na Vercel com `DATABASE_URL` já criou) → `subrinho-somente-dados.sql`
3. Clique em **Run**. Tudo roda numa transação: se der erro, nada fica pela metade.

Acessos de exemplo — **troque as senhas** antes de usar com clientes reais:

| Onde | Usuário | Senha |
|---|---|---|
| `/subrinho/login` | admin@subrinho.com.br | subrinho123 |
| `/afiliado/login` | ana@viagensdaana.com.br | afiliado123 |
| `/afiliado/login` (Sol & Mar) | marina@solemar.com.br | afiliado123 |
| `/loja/viagens-da-ana/entrar` | maria@cliente.com.br | cliente123 |

Alternativa pelo terminal (com o repositório clonado):

```bash
DATABASE_URL="url-do-neon" npm run db:migrate
DATABASE_URL="url-do-neon" npm run db:seed
```

Os arquivos são gerados a partir do seed (`scripts/seed.ts`); para regenerar após mudanças, rode o seed num banco
local e exporte com `pg_dump --column-inserts --no-owner --no-privileges`.
