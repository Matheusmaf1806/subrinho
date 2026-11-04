/** Cliente e agência nunca veem o fornecedor: referência neutra, fotos cifradas e textos sem o nome. */
import { describe, expect, it } from "vitest";
import { parseProductRef, productRef } from "@/server/suppliers/refs";
import { SUPPLIERS } from "@/server/suppliers/registry";
import { mediaSource, mediaUrl } from "@/server/media";
import { mentionsSupplier, stripSupplierMentions } from "@/lib/supplier-names";

describe("referência neutra de produto", () => {
  it("não contém nome nem código do fornecedor e volta ao par fornecedor/produto", () => {
    for (const s of SUPPLIERS) {
      const ref = productRef(s.code, "862326");
      expect(ref).toMatch(/^[a-z]\d-862326$/);
      expect(ref.toLowerCase()).not.toContain(s.code.toLowerCase().slice(0, 4));
      expect(parseProductRef(ref)).toEqual({ supplierCode: s.code, productId: "862326" });
    }
    expect(new Set(SUPPLIERS.map((s) => s.ref)).size).toBe(SUPPLIERS.length);
    expect(parseProductRef(productRef("MAPRO", "01DMR3GHNRMX6KVC1T3GVKDNJC"))).toEqual({ supplierCode: "MAPRO", productId: "01DMR3GHNRMX6KVC1T3GVKDNJC" });
    expect(parseProductRef(productRef("NADIO", "disney-mk"))).toEqual({ supplierCode: "NADIO", productId: "disney-mk" });
    expect(parseProductRef("GGT_BEST_BUY-862326")).toBeNull();
    expect(parseProductRef("zz-1")).toBeNull();
    expect(parseProductRef("h1-../../etc")).toBeNull();
  });
});

describe("fotos pelo domínio da loja", () => {
  it("endereço cifrado, determinístico e sem o domínio do fornecedor", () => {
    const src = "https://photos.hotelbeds.com/giata/xl/00/003424/003424a_hb_a_001.jpg";
    const u = mediaUrl(src)!;
    expect(u).toMatch(/^\/m\/[A-Za-z0-9_-]+$/);
    expect(u.toLowerCase()).not.toContain("hotelbeds");
    expect(mediaUrl(src)).toBe(u);
    expect(mediaSource(u.slice(3))).toBe(src);
    expect(mediaSource(`${u.slice(3, -2)}xx`)).toBeNull(); // adulterado
    expect(mediaUrl("https://images.unsplash.com/photo-1?w=900")).toBe("https://images.unsplash.com/photo-1?w=900"); // foto própria
    expect(mediaUrl(null)).toBeNull();
  });
});

describe("textos do fornecedor sem o nome dele", () => {
  it("remove só as frases que citam o fornecedor", () => {
    const t = "Check-in hour 16:00. Booked and payable by GoGlobal Travel. Car park YES.\nPayable to Hotelbeds USA at the hotel.";
    expect(stripSupplierMentions(t)).toBe("Check-in hour 16:00. Car park YES.");
    expect(mentionsSupplier("Mapro reservation")).toBe(true);
    expect(mentionsSupplier("Resort fee payable on arrival")).toBe(false);
  });
});
