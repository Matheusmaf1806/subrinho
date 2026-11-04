import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    // Testes nunca chamam APIs reais de fornecedores (mesmo se houver credenciais no ambiente).
    env: { SUPPLIERS_MODE: "mock", SUPPLIER_CACHE: "memory", SUPPLIER_BOOKING: "manual" },
  },
});
