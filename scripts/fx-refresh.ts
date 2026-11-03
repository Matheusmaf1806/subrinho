import "./env";
import { closeDb, getDb } from "../src/server/db";
import { refreshFxFromProvider } from "../src/server/fx";

const r = await refreshFxFromProvider(getDb());
console.log(`✔ Câmbio atualizado via ${r.provider} (${r.updated} cotações)`);
await closeDb();
