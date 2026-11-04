import { describe, expect, it } from "vitest";
import { distributeRooms, groupRooms, normalizeHotelPax, occupancyLabel, paxKey } from "@/server/suppliers/hotels/occupancy";
import { boardLabel, hotelGroupKey, htmlToText, parseStars, parseSupplierDate, splitName, stableId, titleCase } from "@/server/suppliers/hotels/common";
import { parseCityName, searchKeyOf } from "@/server/suppliers/hotels/destinations";
import { POPULAR_DESTINATIONS } from "@/server/suppliers/hotels/popular";
import { SupplierError } from "@/server/suppliers/types";

describe("ocupação de hotel", () => {
  it("distribui adultos e crianças pelos quartos (mesma regra na busca, cotação e reserva)", () => {
    expect(distributeRooms({ adults: 3, children: 2, childrenAges: [5, 9], rooms: 2 })).toEqual([
      { adults: 2, childAges: [5] },
      { adults: 1, childAges: [9] },
    ]);
    expect(distributeRooms({ adults: 4, children: 0, rooms: 2 })).toEqual([
      { adults: 2, childAges: [] },
      { adults: 2, childAges: [] },
    ]);
  });

  it("agrupa quartos com a mesma ocupação", () => {
    const g = groupRooms(distributeRooms({ adults: 5, children: 0, rooms: 3 }));
    expect(g).toEqual([
      { adults: 2, childAges: [], count: 2 },
      { adults: 1, childAges: [], count: 1 },
    ]);
  });

  it("exige idade de cada criança e ao menos 1 adulto por quarto", () => {
    expect(() => normalizeHotelPax({ adults: 2, children: 1, rooms: 1 })).toThrow(SupplierError);
    expect(() => normalizeHotelPax({ adults: 1, children: 0, rooms: 2 })).toThrow(/ao menos 1 adulto/);
    expect(() => normalizeHotelPax({ adults: 2, children: 1, childrenAges: [18], rooms: 1 })).toThrow(/0 a 17/);
    expect(() => normalizeHotelPax({ adults: 9, children: 0, rooms: 1 })).toThrow(/por quarto/);
    expect(normalizeHotelPax({ adults: 2, children: 1, childrenAges: [7], rooms: 1 })).toEqual({ adults: 2, children: 1, rooms: 1, childrenAges: [7] });
  });

  it("descreve e assina a ocupação", () => {
    const pax = { adults: 2, children: 2, childrenAges: [0, 7], rooms: 1 };
    expect(occupancyLabel(pax)).toBe("1 quarto · 2 adultos · 2 crianças (menos de 1 ano, 7 anos)");
    expect(paxKey(pax)).toBe(paxKey({ ...pax, childrenAges: [0, 7] }));
    expect(paxKey(pax)).not.toBe(paxKey({ ...pax, childrenAges: [1, 7] }));
  });
});

describe("textos dos fornecedores", () => {
  it("capitaliza nomes em maiúsculas preservando siglas", () => {
    expect(titleCase("ORLANDO AND DISNEYWORLD AREA (FL)")).toBe("Orlando and Disneyworld Area (FL)");
    expect(titleCase("HOLIDAY INN RESORT ORLANDO - LAKE BUENA VISTA")).toBe("Holiday Inn Resort Orlando - Lake Buena Vista");
    expect(titleCase("Hôtel Le Marais")).toBe("Hôtel Le Marais");
  });

  it("converte HTML em texto com parágrafos", () => {
    expect(htmlToText("<p><b>Quartos</b> Ar&nbsp;condicionado</p><p>Wi&#8209;Fi &amp; TV<br />Cofre</p>")).toBe("Quartos Ar condicionado\n\nWi‑Fi & TV\nCofre");
    expect(htmlToText('<script>alert("x")</script>ok')).toBe("ok");
  });

  it("lê datas e estrelas dos fornecedores", () => {
    expect(parseSupplierDate("30/Dec/2026")).toBe("2026-12-30");
    expect(parseSupplierDate("30/12/2026")).toBe("2026-12-30");
    expect(parseSupplierDate("2026-12-30T23:59:00+01:00")).toBe("2026-12-30");
    expect(parseStars("3.5")).toBe(3.5);
    expect(parseStars("4EST")).toBe(4);
    expect(parseStars("")).toBeUndefined();
  });

  it("traduz regimes e separa nome/sobrenome", () => {
    expect(boardLabel("BB")).toBe("Café da manhã");
    expect(boardLabel("AI")).toBe("All inclusive");
    expect(splitName("  Maria   da Silva ")).toEqual({ first: "Maria da", last: "Silva" });
    expect(() => splitName("Maria")).toThrow(/sobrenome/);
  });

  it("gera ids estáveis e chave de hotel entre fornecedores", () => {
    expect(stableId("ggt", "ROOM KING", "BB", "RF")).toBe(stableId("ggt", "room  king", "bb", "rf"));
    expect(stableId("ggt", "ROOM KING", "BB", "RF")).not.toBe(stableId("ggt", "ROOM KING", "BB", "NR"));
    expect(hotelGroupKey("HOLIDAY INN RESORT ORLANDO - LAKE BUENA VISTA")).toBe(hotelGroupKey("Holiday Inn Resort Orlando – Lake Buena Vista"));
  });
});

describe("destinos", () => {
  it("normaliza nomes de cidade da GGT e da Hotelbeds na mesma chave", () => {
    expect(parseCityName("ORLANDO (FL)", "GGT")).toEqual({ city: "Orlando", region: "FL", searchKey: "orlando" });
    expect(parseCityName("Orlando Area - Florida - FL", "HOTELBEDS")).toMatchObject({ region: "FL", searchKey: "orlando" });
    expect(parseCityName("ROME", "GGT").searchKey).toBe(parseCityName("Rome", "HOTELBEDS").searchKey);
    expect(searchKeyOf("SINGAPORE-ALL LOCATIONS")).toBe("singapore");
    expect(searchKeyOf("ARUBA - ALL LOCATIONS")).toBe("aruba");
    expect(searchKeyOf("DUBAI AREA")).toBe("dubai");
    expect(searchKeyOf("SAO PAULO (SP)")).toBe("sao paulo");
  });

  it("destinos populares têm ids únicos e chaves normalizadas", () => {
    const ids = POPULAR_DESTINATIONS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of POPULAR_DESTINATIONS) {
      expect(p.country).toMatch(/^[A-Z]{2}$/);
      for (const k of p.keys) expect(k).toBe(searchKeyOf(k));
      for (const c of p.ggt ?? []) expect(c).toMatch(/^\d+$/);
    }
  });
});
