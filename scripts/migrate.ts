import "./env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/server/db";

await migrate(getDb(), { migrationsFolder: "./drizzle" });
console.log("✔ Migrações aplicadas");
await closeDb();
