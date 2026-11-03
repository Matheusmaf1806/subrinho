import type { affiliates } from "@/server/db/schema";
import type { BrandingInitial, Preset } from "@/components/branding-editor";
import { PHOTO, photo, type PhotoKey } from "./images";

const HERO_PRESETS: PhotoKey[] = [
  "heroWoman",
  "heroMan",
  "travelerCity",
  "travelerDenim",
  "travelerHiker",
  "friends",
  "infinityPool",
  "tropicalResort",
  "villaPool",
  "colosseum",
  "eiffel",
  "castle2",
  "nycSkyline",
  "lisbon",
  "floridaPalms",
  "planeWing",
];

/** Fotos prontas oferecidas no editor de marca (mesmo recorte usado ao salvar). */
export function brandPresets(): Preset[] {
  return HERO_PRESETS.map((key) => ({ key, id: PHOTO[key], thumb: photo(key, 160, 200), full: photo(key, 900, 1000) }));
}

export function brandingInitial(a: typeof affiliates.$inferSelect): BrandingInitial {
  return {
    name: a.name,
    brandColor: a.brandColor,
    darkColor: a.darkColor,
    fontFamily: a.fontFamily,
    logoUrl: a.logoUrl,
    logoOnDarkUrl: a.logoOnDarkUrl,
    faviconUrl: a.faviconUrl,
    heroTitle: a.heroTitle,
    heroSubtitle: a.heroSubtitle,
    heroImageUrl: a.heroImageUrl,
    heroImage2Url: a.heroImage2Url,
    tagline: a.tagline,
    instagram: a.instagram,
    showPoweredBy: a.showPoweredBy,
  };
}
