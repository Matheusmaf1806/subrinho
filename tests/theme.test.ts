import { describe, expect, it } from "vitest";
import { contrast, readableOn, textSafe } from "@/lib/color";
import { monogram, resolveTheme } from "@/lib/theme";

describe("cores white-label", () => {
  it("texto sobre a cor principal sempre legível", () => {
    expect(readableOn("#E4113F")).toBe("#FFFFFF");
    expect(readableOn("#FFC531")).toBe("#0A0A0B"); // amarelo → texto escuro
    expect(readableOn("#0F766E")).toBe("#FFFFFF");
  });
  it("cor principal como texto sobre branco ganha contraste ≥ 4,5", () => {
    const t = textSafe("#FFC531");
    expect(contrast(t, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(textSafe("#0F766E")).toBe("#0F766E"); // já tem contraste
  });
  it("cor escura clara demais volta para o preto", () => {
    expect(resolveTheme({ darkColor: "#BBBBBB" }).ink).toBe("#0A0A0B");
    expect(resolveTheme({ darkColor: "#10214A" }).ink).toBe("#10214A");
  });
  it("fonte desconhecida usa a padrão", () => {
    expect(resolveTheme({ fontFamily: "comic-sans" }).font.id).toBe("inter-tight");
  });
  it("monograma", () => {
    expect(monogram("Viagens da Ana")).toBe("VA");
    expect(monogram("Sol & Mar Viagens")).toBe("SV");
    expect(monogram("Rotas")).toBe("RO");
  });
});
