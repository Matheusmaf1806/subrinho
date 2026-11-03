import "./env";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db";

if (process.env.NODE_ENV === "production") throw new Error("Não rode reset em produção");
const db = getDb();
await db.execute(sql`drop schema if exists public cascade`);
await db.execute(sql`drop schema if exists drizzle cascade`);
await db.execute(sql`create schema public`);
console.log("✔ Banco zerado");
await closeDb();
