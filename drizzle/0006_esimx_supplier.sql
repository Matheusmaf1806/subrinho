-- Chip eSIM (eSIMX): em bancos que já têm fornecedores cadastrados (produção), garante a eSIMX na lista
-- (a loja só usa fornecedores ativos desta tabela). Banco novo fica vazio: o seed cadastra todos.
INSERT INTO "suppliers" ("code", "name", "category", "default_currency", "active", "notes")
SELECT 'ESIMX', 'eSIMX', 'CHIP', 'USD', true, 'Chip eSIM internacional (API de atacado, saldo pré-pago)'
WHERE EXISTS (SELECT 1 FROM "suppliers")
ON CONFLICT ("code") DO NOTHING;
