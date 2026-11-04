import "./env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, resolveDatabaseUrl } from "../src/server/db";

// No deploy (vercel-build) as migrações rodam antes do build. Sem DATABASE_URL, apenas avisa.
if (!resolveDatabaseUrl()) {
  console.warn("⚠ DATABASE_URL não definida — migrações não aplicadas. Configure a variável no projeto da Vercel.");
  process.exit(0);
}
await migrate(getDb(), { migrationsFolder: "./drizzle" });
console.log("✔ Migrações aplicadas");
await closeDb();
