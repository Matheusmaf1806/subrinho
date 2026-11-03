/**
 * Fotos (Unsplash — licença livre para uso comercial, sem atribuição obrigatória).
 * Servidas pelo CDN público images.unsplash.com com recorte/compressão por parâmetro.
 * Para trocar uma foto, substitua o ID (parte depois de "photo-").
 */
export const PHOTO = {
  // pessoas / campanha
  heroWoman: "1494790108377-be9c29b29330",
  heroMan: "1539571696357-5a69c17a67c6",
  travelerCity: "1520466809213-7b9a56adcd45",
  travelerDenim: "1517841905240-472988babdf9",
  travelerHiker: "1598966739654-5e9a252d8c32",
  friends: "1529156069898-49953e39b3ac",
  airportBoard: "1517400508447-f8dd518b86db",
  airportLounge: "1530521954074-e64f6810b32d",
  suitcaseSilhouette: "1504150558240-0b4fd8946624",
  planeWing: "1436491865332-7a61a109cc05",
  planeTakeoff: "1544016768-982d1554f0b9",
  infinityPool: "1551918120-9739cb430c6d",
  // destinos
  colosseum: "1552832230-c0197dd311b5",
  colosseumAerial: "1555992828-ca4dbe41d294",
  colosseumArches: "1515542622106-78bda8ba0e5b",
  vatican: "1531572753322-ad063cecc140",
  romeRiver: "1529260830199-42c24126f198",
  florence: "1541370976299-4d24ebbc9077",
  milanDuomo: "1610016302534-6f67f1c968d8",
  vernazza: "1499678329028-101435549a4e",
  venice: "1523906834658-6e24ef2386f9",
  paris: "1499856871958-5b9627545d1a",
  eiffel: "1502602898657-3e91760cbb34",
  museum: "1499426600726-a950358acf16",
  nycSkyline: "1485871981521-5b1fd3805eee",
  timesSquare: "1496442226666-8d4d0e62e6e9",
  lisbon: "1585208798174-6cedd86e019a",
  floridaPalms: "1605723517503-3cadb5818a0c",
  castle: "1597466599360-3b9775841aec",
  castle2: "1575089776834-8be34696ffb9",
  fireworks: "1498931299472-f7a63a5a1cfa",
  carousel: "1513889961551-628c1e5e2ee9",
  // hospedagem / casas
  resortWood: "1566073771259-6a8506099945",
  hotelPoolNight: "1542314831-068cd1dbfeeb",
  tropicalResort: "1520250497591-112f2f40a3f4",
  palmPool: "1551882547-ff40c63fe5fa",
  hotelRoomWarm: "1582719478250-c89cae4dc85b",
  hotelRoomModern: "1631049307264-da0ec9d70304",
  hotelLounge: "1571896349842-33c89424de2d",
  villaPool: "1613977257363-707ba9348227",
  modernHouse: "1580587771525-78b9dba3b914",
  housePool: "1512917774080-9991f1c4c750",
  whiteHouse: "1600596542815-ffad4c1539a9",
  // chip
  phone: "1511707171634-5f897ff02aa9",
  phones: "1556656793-08538906a9f8",
} as const;

export type PhotoKey = keyof typeof PHOTO;

export function photo(idOrKey: PhotoKey | string, w = 1200, h?: number): string {
  const id = (PHOTO as Record<string, string>)[idOrKey] ?? idOrKey;
  const size = h ? `&w=${w}&h=${h}` : `&w=${w}`;
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=75${size}`;
}

/** Foto padrão por categoria (quando o fornecedor não manda imagem). */
export const CATEGORY_PHOTO: Record<string, PhotoKey> = {
  TICKETS: "colosseum",
  LODGING: "tropicalResort",
  HOUSES: "villaPool",
  INSURANCE: "planeWing",
  CHIP: "phone",
  CAR_RENTAL: "floridaPalms",
  REMOTE_GUIDE: "travelerCity",
  CRUISE: "infinityPool",
  TRANSFER: "airportLounge",
  ITINERARY: "friends",
};

const DESTINATION_GALLERY: Record<string, [PhotoKey, PhotoKey]> = {
  Roma: ["vatican", "romeRiver"],
  Florença: ["florence", "vernazza"],
  Milão: ["milanDuomo", "venice"],
  Orlando: ["floridaPalms", "fireworks"],
  "Nova York": ["timesSquare", "nycSkyline"],
  Paris: ["eiffel", "paris"],
  Lisboa: ["lisbon", "travelerCity"],
};

const CATEGORY_GALLERY: Record<string, [PhotoKey, PhotoKey]> = {
  TICKETS: ["friends", "fireworks"],
  LODGING: ["hotelRoomModern", "infinityPool"],
  HOUSES: ["housePool", "friends"],
  INSURANCE: ["airportBoard", "planeTakeoff"],
  CHIP: ["phones", "travelerCity"],
};

/** Duas fotos de apoio para a galeria do detalhe (destino > categoria). */
export function galleryFor(category: string, destination?: string | null): [string, string] {
  const keys = (destination && DESTINATION_GALLERY[destination]) || CATEGORY_GALLERY[category] || ["friends", "planeWing"];
  return [photo(keys[0], 900), photo(keys[1], 900)];
}
