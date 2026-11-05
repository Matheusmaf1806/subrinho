/** Loja no próprio endereço: reconhecimento do domínio, validação e o proxy (reescrita sem /loja/<slug>). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { checkCustomDomain, checkSubdomain, classifyHost, domainConfig, isApexDomain, normalizeHost, storeOrigin, STORE_HOST_HEADER } from "@/lib/store-domains";
import { proxy } from "@/proxy";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const CFG = domainConfig(env({ STORE_ROOT_DOMAIN: "subrinho.com.br", APP_URL: "https://subrinho.vercel.app" }));

describe("endereços", () => {
  it("normaliza o que vem no cabeçalho ou é colado no painel", () => {
    expect(normalizeHost("ViagensDaAna.com.br:443")).toBe("viagensdaana.com.br");
    expect(normalizeHost("https://loja.viagensdaana.com.br/hospedagem?x=1")).toBe("loja.viagensdaana.com.br");
    expect(normalizeHost("exemplo.com.")).toBe("exemplo.com");
  });

  it("separa plataforma, subdomínio e domínio próprio", () => {
    expect(classifyHost("subrinho.vercel.app", CFG)).toEqual({ kind: "platform" });
    expect(classifyHost("subrinho-git-x.vercel.app", CFG)).toEqual({ kind: "platform" });
    expect(classifyHost("localhost:3000", CFG)).toEqual({ kind: "platform" });
    expect(classifyHost("subrinho.com.br", CFG)).toEqual({ kind: "platform" });
    expect(classifyHost("www.subrinho.com.br", CFG)).toEqual({ kind: "platform" });
    expect(classifyHost("viagensdaana.subrinho.com.br", CFG)).toEqual({ kind: "subdomain", subdomain: "viagensdaana" });
    expect(classifyHost("api.subrinho.com.br", CFG)).toEqual({ kind: "platform" });
    expect(classifyHost("a.b.subrinho.com.br", CFG)).toEqual({ kind: "platform" });
    expect(classifyHost("viagensdaana.com.br", CFG)).toEqual({ kind: "custom", host: "viagensdaana.com.br" });
    expect(classifyHost("www.viagensdaana.com.br", CFG)).toEqual({ kind: "custom", host: "viagensdaana.com.br" });
    expect(classifyHost("loja.viagensdaana.com.br", CFG)).toEqual({ kind: "custom", host: "loja.viagensdaana.com.br" });
  });

  it("sem domínio raiz configurado, subdomínios ficam desligados", () => {
    const cfg = domainConfig(env({ APP_URL: "https://subrinho.vercel.app" }));
    expect(classifyHost("viagensdaana.subrinho.com.br", cfg)).toEqual({ kind: "custom", host: "viagensdaana.subrinho.com.br" });
  });

  it("valida subdomínio e domínio próprio", () => {
    expect(checkSubdomain("Viagens-da-Ana")).toEqual({ value: "viagens-da-ana" });
    expect(checkSubdomain("www")).toMatchObject({ error: expect.stringContaining("reservado") });
    expect(checkSubdomain("-ana")).toHaveProperty("error");
    expect(checkSubdomain("ana viagens")).toHaveProperty("error");
    expect(checkCustomDomain("https://www.ViagensDaAna.com.br/", CFG)).toEqual({ value: "viagensdaana.com.br" });
    expect(checkCustomDomain("loja.viagensdaana.com.br", CFG)).toEqual({ value: "loja.viagensdaana.com.br" });
    expect(checkCustomDomain("", CFG)).toEqual({ value: null });
    expect(checkCustomDomain("viagensdaana", CFG)).toHaveProperty("error");
    expect(checkCustomDomain("ana.subrinho.com.br", CFG)).toMatchObject({ error: expect.stringContaining("plataforma") });
    expect(checkCustomDomain("minhaloja.vercel.app", CFG)).toHaveProperty("error");
  });

  it("apex ou subdomínio (muda o registro de DNS)", () => {
    expect(isApexDomain("viagensdaana.com.br")).toBe(true);
    expect(isApexDomain("viagensdaana.com")).toBe(true);
    expect(isApexDomain("loja.viagensdaana.com.br")).toBe(false);
    expect(isApexDomain("loja.viagensdaana.com")).toBe(false);
  });

  it("endereço oficial: domínio próprio verificado > subdomínio > nenhum", () => {
    const base = { slug: "viagens-da-ana", subdomain: "viagensdaana", customDomain: "viagensdaana.com.br", customDomainVerifiedAt: null as Date | null };
    expect(storeOrigin(base, CFG)).toBe("https://viagensdaana.subrinho.com.br");
    expect(storeOrigin({ ...base, customDomainVerifiedAt: new Date() }, CFG)).toBe("https://viagensdaana.com.br");
    expect(storeOrigin(base, domainConfig(env({})))).toBeNull();
  });
});

describe("proxy", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.STORE_ROOT_DOMAIN = "subrinho.com.br";
    process.env.APP_URL = "https://subrinho.vercel.app";
  });
  afterEach(() => {
    process.env = { ...saved };
  });
  const req = (url: string, headers: Record<string, string> = {}, method = "GET") => new NextRequest(url, { headers, method });
  const rewriteOf = (r: Response) => r.headers.get("x-middleware-rewrite");

  it("subdomínio da loja: reescreve sem mostrar /loja na URL e avisa a aplicação", () => {
    const r = proxy(req("https://viagensdaana.subrinho.com.br/hospedagem?destino=Roma"));
    expect(new URL(rewriteOf(r)!).pathname).toBe("/loja/viagensdaana.subrinho.com.br/hospedagem");
    expect(new URL(rewriteOf(r)!).search).toBe("?destino=Roma");
    expect(r.headers.get(`x-middleware-request-${STORE_HOST_HEADER}`)).toBe("viagensdaana.subrinho.com.br");
  });

  it("domínio próprio: a raiz vira a página inicial da loja", () => {
    const r = proxy(req("https://www.viagensdaana.com.br/"));
    expect(new URL(rewriteOf(r)!).pathname).toBe("/loja/viagensdaana.com.br");
  });

  it("API, mídia e arquivos passam direto; painéis voltam para a plataforma", () => {
    for (const p of ["/api/public/destinos?q=ro", "/m/abc123", "/logo.svg", "/robots.txt"]) expect(rewriteOf(proxy(req(`https://viagensdaana.com.br${p}`)))).toBeNull();
    const r = proxy(req("https://viagensdaana.com.br/afiliado/loja"));
    expect(r.headers.get("location")).toBe("https://subrinho.vercel.app/afiliado/loja");
  });

  it("na plataforma, /loja/<slug> aberto no navegador vai para o subdomínio; navegação interna e ações não", () => {
    const r = proxy(req("https://subrinho.vercel.app/loja/viagens-da-ana/ingressos?data=2026-12-10"));
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("https://viagens-da-ana.subrinho.com.br/ingressos?data=2026-12-10");
    expect(proxy(req("https://subrinho.vercel.app/loja/viagens-da-ana", { rsc: "1" })).headers.get("location")).toBeNull();
    expect(proxy(req("https://subrinho.vercel.app/loja/viagens-da-ana", { "next-action": "x" }, "POST")).headers.get("location")).toBeNull();
    // sem subdomínios ligados, /loja/<slug> continua funcionando
    delete process.env.STORE_ROOT_DOMAIN;
    expect(proxy(req("https://subrinho.vercel.app/loja/viagens-da-ana")).headers.get("location")).toBeNull();
  });

  it("descarta o cabeçalho de endereço que vem de fora", () => {
    const r = proxy(req("https://subrinho.vercel.app/afiliado", { [STORE_HOST_HEADER]: "forjado.com" }));
    expect(r.headers.get(`x-middleware-request-${STORE_HOST_HEADER}`)).toBeNull();
    expect(r.headers.get("x-middleware-override-headers") ?? "").not.toContain(STORE_HOST_HEADER);
  });
});
