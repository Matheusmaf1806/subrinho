# Carregar o banco no Neon (sem terminal)

Use **um único arquivo**: `subrinho-instalar.sql`. Ele funciona em qualquer situação — banco vazio, tabelas já
criadas pelo deploy, instalação pela metade ou já instalada (o que já existe é mantido; pode rodar de novo sem erro).

1. Neon → seu projeto → **SQL Editor**.
2. Se aparecer **“Failed transaction: ROLLBACK required”**, clique em **ROLLBACK** primeiro.
3. Apague todo o texto do editor, cole o arquivo inteiro e clique em **Run**.
4. No final aparece uma tabela com `lojas = 3`, `pedidos = 6`, `fornecedores = 10` e `status = instalado`.

Se der erro, clique na aba do comando com **ERROR** (abaixo do botão Run) para ver a mensagem.

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

Para regenerar o arquivo depois de mudar o schema ou o seed: `npm run db:reset && npm run neon:sql`.
