/** Conteúdo da página do hotel: o que vem dos fornecedores organizado por assunto. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatMeters, groupAmenities, hhmm, issuesDuring, parseDistanceLine, photoTag, roomAmenitiesFrom, splitDescription } from "@/server/suppliers/hotels/content";
import { xmlParser } from "@/server/suppliers/ggt/client";
import { parseHotelInfo } from "@/server/suppliers/ggt/adapter";
import { parseHotelDetails, type HbHotelDetails } from "@/server/suppliers/hotelbeds/adapter";

describe("GGT: HOTEL_INFO completo", () => {
  const doc = xmlParser.parse(readFileSync("tests/fixtures/ggt/hotel-info.xml", "utf8"));
  const info = parseHotelInfo(doc.Root.Main);

  it("fotos com categoria, mapa e número de quartos", () => {
    expect(info.photos.length).toBe(27);
    expect(info.photos.filter((p) => p.tag === "Quartos").length).toBeGreaterThan(10);
    expect(info.photos.some((p) => p.tag === "Áreas comuns")).toBe(true);
    expect(info.coordinates).toEqual({ lat: 28.462529, lng: -81.398105 });
    expect(info.roomCount).toBe(212); // "num dos 212 quartos" (o campo RoomCount vem vazio)
  });

  it("descrição em seções: sobre, arredores, aeroportos, horários, taxas, idiomas", () => {
    const s = info.sections;
    expect(s.about.map((a) => a.title)).toEqual(["Localização", "Quartos", "Comodidades", "Outras comodidades"]);
    expect(s.nearby.find((n) => n.name === "Florida Mall")).toEqual({ name: "Florida Mall", distance: "1,9 km", kind: "place" });
    expect(s.nearby.filter((n) => n.kind === "airport").map((n) => n.distance)).toEqual(["17 km", "25,2 km", "52,2 km"]);
    expect(s.times).toEqual({ checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00", minAge: 21 });
    expect(s.languages).toEqual(["Inglês"]);
    const fees = s.policies.find((p) => p.title === "Taxas pagas no hotel")!;
    expect(fees.items).toContain("Depósito: 50 USD por alojamento e por estadia");
    expect(s.policies.find((p) => p.title === "Taxas opcionais")!.items[0]).toMatch(/animais de estimação: 25 USD/);
    // rodapés do fornecedor não aparecem
    const all = JSON.stringify(s);
    expect(all).not.toMatch(/lista anterior pode não estar completa|tradução automática|Incluímos todas as taxas/);
    expect(all).toMatch(/receção está aberta diariamente das 7:00 às 23:00/);
  });

  it("comodidades agrupadas, sem itens negativos", () => {
    const g = Object.fromEntries(info.amenities.map((x) => [x.group, x.items]));
    expect(g["Estacionamento e transporte"]).toContain("Estacionamento sem motorista grátis");
    expect(g["Estacionamento e transporte"]).toContain("Estacionamento (espaços limitados)"); // não é "spa"
    expect(g["Acessibilidade"]).toContain("Acesso para cadeiras de rodas (poderá haver algumas limitações)");
    expect(JSON.stringify(info.amenities)).not.toMatch(/não é acessível|fumadores/);
    expect(roomAmenitiesFrom(info.roomFacilities)).not.toContain("Tamanho do televisor: polegadas");
    expect(roomAmenitiesFrom(info.roomFacilities)).toContain("Ar condicionado");
  });
});

describe("Hotelbeds: detalhe da Content API", () => {
  const h: HbHotelDetails = {
    name: { content: "Hotel Lago Azul" },
    description: { content: "Hotel à beira do lago.\n\nA 5 minutos dos parques." },
    address: { content: "RUA DO LAGO, 10" },
    city: { content: "ORLANDO" },
    category: { code: "4EST" },
    coordinates: { latitude: 28.38, longitude: -81.56 },
    images: [
      { path: "00/1/quarto.jpg", type: { code: "HAB" }, roomCode: "DBL.ST", visualOrder: 3 },
      { path: "00/1/fachada.jpg", type: { code: "GEN" }, visualOrder: 1 },
      { path: "00/1/piscina.jpg", type: { code: "PIS" }, visualOrder: 2 },
    ],
    facilities: [
      { facilityCode: 260, facilityGroupCode: 70, timeFrom: "15:00:00", timeTo: "00:00:00", description: { content: "Hora de check-in" } },
      { facilityCode: 390, facilityGroupCode: 70, timeTo: "11:00:00", description: { content: "Hora de check-out" } },
      { facilityCode: 564, facilityGroupCode: 85, number: 21, description: { content: "Idade mínima para check-in" } },
      { facilityCode: 561, facilityGroupCode: 85, indLogic: true, description: { content: "Depósito na chegada" } },
      { facilityCode: 320, facilityGroupCode: 70, indYesOrNo: true, indFee: true, description: { content: "Estacionamento" } },
      { facilityCode: 100, facilityGroupCode: 70, indLogic: true, description: { content: "Wi-Fi" } },
      { facilityCode: 101, facilityGroupCode: 73, indYesOrNo: false, description: { content: "Clube infantil" } },
      { facilityCode: 102, facilityGroupCode: 71, indLogic: true, description: { content: "Restaurante" } },
      { facilityCode: 103, facilityGroupCode: 60, indLogic: true, description: { content: "Ar-condicionado" } },
      { facilityCode: 104, facilityGroupCode: 30, indLogic: true, description: { content: "Visa" } },
      { facilityCode: 105, facilityGroupCode: 30, indLogic: true, description: { content: "Mastercard" } },
      { facilityCode: 106, facilityGroupCode: 20, number: 340, description: { content: "Número total de quartos" } },
      { facilityCode: 107, facilityGroupCode: 40, distance: 2500, description: { content: "Distância do centro da cidade" } },
    ],
    interestPoints: [
      { poiName: "Disney Springs", distance: "2100" },
      { poiName: "Magic Kingdom", distance: "11000" },
    ],
    terminals: [{ terminalCode: "MCO", terminalType: "A", distance: 27, name: { content: "Aeroporto Internacional de Orlando" } }],
    issues: [
      { description: { content: "A piscina externa fica fechada para reforma." }, dateFrom: "2026-01-10", dateTo: "2026-01-20" },
      { description: { content: "Obras no lobby." }, dateFrom: "2025-01-01", dateTo: "2025-02-01" },
    ],
    rooms: [
      {
        roomCode: "DBL.ST",
        maxPax: 3,
        roomFacilities: [{ indLogic: true, description: { content: "Cofre" } }],
        roomStays: [{ stayType: "BED", roomStayFacilities: [{ description: { content: "Cama de casal" }, number: 1 }] }],
      },
    ],
  };
  const c = parseHotelDetails(h);

  it("fotos com categoria (gerais primeiro) e fotos de cada quarto", () => {
    expect(c.hotel.photos.map((p) => p.tag)).toEqual(["Fachada e arredores", "Piscina", "Quartos"]);
    expect(c.rooms["DBL.ST"].photos).toEqual(["https://photos.hotelbeds.com/giata/xl/00/1/quarto.jpg"]);
    expect(c.rooms["DBL.ST"].amenities).toEqual(["Cama de casal", "Cofre"]);
    expect(c.rooms["DBL.ST"].maxPax).toBe(3);
  });

  it("horários, idade mínima, arredores, aeroporto, cartões, números", () => {
    expect(c.hotel.times).toEqual({ checkInFrom: "15:00", checkInUntil: null, checkOutUntil: "11:00", minAge: 21 });
    expect(c.hotel.coordinates).toEqual({ lat: 28.38, lng: -81.56 });
    expect(c.hotel.nearby).toEqual([
      { name: "Disney Springs", distance: "2,1 km", kind: "place" },
      { name: "Magic Kingdom", distance: "11 km", kind: "place" },
      { name: "Centro da cidade", distance: "2,5 km", kind: "place" },
      { name: "Aeroporto Internacional de Orlando (MCO)", distance: "27 km", kind: "airport" },
    ]);
    expect(c.hotel.policies).toEqual([
      { title: "Na chegada", items: ["Depósito na chegada"] },
      { title: "Cartões aceitos no hotel", items: ["Visa, Mastercard"] },
    ]);
    expect(c.hotel.facts).toEqual([{ label: "Número total de quartos", value: "340" }]);
  });

  it("comodidades que existem (com 'pago à parte'), sem as marcadas como inexistentes", () => {
    const items = c.hotel.amenities.flatMap((g) => g.items);
    expect(items).toContain("Estacionamento (pago à parte)");
    expect(items).toContain("Wi-Fi");
    expect(items).toContain("Restaurante");
    expect(items).not.toContain("Clube infantil");
    expect(items.some((i) => /check-in|check-out/i.test(i))).toBe(false);
    expect(c.hotel.roomAmenities).toEqual(["Ar-condicionado"]);
  });

  it("avisos só quando pegam a estadia", () => {
    expect(issuesDuring(c.hotel.issues, "2026-01-15", "2026-01-18").map((i) => i.text)).toEqual(["A piscina externa fica fechada para reforma."]);
    expect(issuesDuring(c.hotel.issues, "2026-03-01", "2026-03-05")).toEqual([]);
  });
});

describe("regras comuns", () => {
  it("categorias de foto, distâncias e horários", () => {
    expect(photoTag("Outdoor pool")).toBe("Piscina");
    expect(photoTag("Guestroom")).toBe("Quartos");
    expect(photoTag("Lobby")).toBe("Áreas comuns");
    expect(photoTag("Restaurant")).toBe("Restaurantes");
    expect(photoTag("Exterior")).toBe("Fachada e arredores");
    expect(photoTag("")).toBeNull();
    expect(formatMeters(850)).toBe("850 m");
    expect(formatMeters(1900)).toBe("1,9 km");
    expect(formatMeters(25000)).toBe("25 km");
    expect(formatMeters(0)).toBeNull();
    expect(hhmm("15:00:00")).toBe("15:00");
    expect(hhmm("3:00 PM")).toBe("15:00");
    expect(hhmm("11")).toBe("11:00");
    expect(hhmm("meio-dia")).toBeNull();
    expect(parseDistanceLine("Florida Mall - 1,9 km/1,2 mi")).toEqual({ name: "Florida Mall", distance: "1,9 km" });
    expect(parseDistanceLine("Os aeroportos mais próximos são:")).toBeNull();
  });

  it("agrupa comodidades e ignora negativas", () => {
    const g = groupAmenities(["Piscina ao ar livre", "Wi-Fi grátis", "Bar na piscina", "Não aceita animais", "Recepção 24 horas", "Berço (sobretaxa)"]);
    expect(g).toEqual([
      { group: "Lazer e bem-estar", items: ["Piscina ao ar livre"] },
      { group: "Alimentação", items: ["Bar na piscina"] },
      { group: "Internet e negócios", items: ["Wi-Fi grátis"] },
      { group: "Família", items: ["Berço (pago à parte)"] },
      { group: "Serviços", items: ["Recepção 24 horas"] },
    ]);
  });

  it("lista curta depois de 'inclui:' vira uma linha; 'Sem …' não é comodidade", () => {
    const s = splitDescription("Taxas obrigatórias (pagas no hotel): O hotel cobra os seguintes custos ao chegar, que podem incluir impostos:\nTaxa do hotel: 34.04 USD por noite\nA taxa de alojamento inclui:\nAcesso ao centro de fitness\nCofre no quarto\nEstacionamento");
    expect(s.policies).toEqual([
      {
        title: "Taxas pagas no hotel",
        items: ["O hotel cobra os seguintes custos ao chegar, que podem incluir impostos:", "Taxa do hotel: 34.04 USD por noite", "A taxa de alojamento inclui: Acesso ao centro de fitness, Cofre no quarto, Estacionamento"],
      },
    ]);
    expect(roomAmenitiesFrom(["Sem berços (camas para crianças)", "Caminho sem escadas", "Varanda"])).toEqual(["Caminho sem escadas", "Varanda"]);
  });

  it("texto sem títulos fica todo em 'sobre'", () => {
    const s = splitDescription("Hotel no centro.\n\nPerto do metrô.");
    expect(s.about).toEqual([
      { title: null, text: "Hotel no centro." },
      { title: null, text: "Perto do metrô." },
    ]);
    expect(s.nearby).toEqual([]);
  });
});
