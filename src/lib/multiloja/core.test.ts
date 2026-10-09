import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PALETTES,
  PALETTE_KEYS,
  contrastRatio,
  customDomainError,
  grossProfit,
  marginError,
  parseMargin,
  parseTenantHost,
  phoneDigits,
  planRoom,
  priceProduct,
  salePrice,
  socialUrl,
  subdomainError,
  suggestSubdomain,
} from "./core.ts";

test("host: subdomínio do domínio raiz vira loja; o resto é o site ou domínio próprio", () => {
  const root = "lojas.padraocolor.com.br";
  assert.deepEqual(parseTenantHost("ana.lojas.padraocolor.com.br", root), { kind: "subdomain", subdomain: "ana" });
  assert.deepEqual(parseTenantHost("ANA.Lojas.PadraoColor.com.br:443", root), { kind: "subdomain", subdomain: "ana" });
  assert.deepEqual(parseTenantHost("lojas.padraocolor.com.br", root), { kind: "main" });
  assert.deepEqual(parseTenantHost("www.lojas.padraocolor.com.br", root), { kind: "main" });
  assert.deepEqual(parseTenantHost("a.b.lojas.padraocolor.com.br", root), { kind: "main" });
  assert.deepEqual(parseTenantHost("padraocolor.com.br", root, ["padraocolor.com.br"]), { kind: "main" });
  assert.deepEqual(parseTenantHost("www.minhaloja.com.br", root), { kind: "custom", domain: "www.minhaloja.com.br" });
  assert.deepEqual(parseTenantHost("192.168.0.10:3100", root), { kind: "main" });
});

test("host: em desenvolvimento, <loja>.localhost é loja e localhost é o site", () => {
  assert.deepEqual(parseTenantHost("localhost:3100", "localhost"), { kind: "main" });
  assert.deepEqual(parseTenantHost("qualidade.localhost:3100", "localhost"), { kind: "subdomain", subdomain: "qualidade" });
  // Sem domínio raiz de dev, *.localhost nunca é tratado como domínio próprio.
  assert.deepEqual(parseTenantHost("qualidade.localhost:3100", "lojas.padraocolor.com.br"), { kind: "main" });
});

test("subdomínio: formato, tamanho e reservados", () => {
  assert.equal(subdomainError("atelie-da-ana"), null);
  assert.equal(subdomainError("ab"), "Use pelo menos 3 caracteres.");
  assert.match(subdomainError("-ana") ?? "", /hífen/);
  assert.match(subdomainError("Ana") ?? "", /minúsculas/);
  assert.match(subdomainError("ana--b") ?? "", /dois hífens/);
  assert.match(subdomainError("painel") ?? "", /reservado/);
  assert.equal(suggestSubdomain("Ateliê da Ana!"), "atelie-da-ana");
});

test("domínio próprio", () => {
  assert.equal(customDomainError("www.minhaloja.com.br"), null);
  assert.equal(customDomainError(""), null);
  assert.ok(customDomainError("https://minhaloja.com.br/"));
  assert.ok(customDomainError("minhaloja"));
});

test("margem: mínimo, máximo e leitura com vírgula", () => {
  assert.equal(parseMargin("35,5%"), 35.5);
  assert.ok(Number.isNaN(parseMargin("")));
  assert.equal(marginError(20), null);
  assert.match(marginError(10) ?? "", /mínima/);
  assert.match(marginError(301) ?? "", /máxima/);
  assert.ok(marginError(Number.NaN));
});

test("preço da loja = base × (1 + margem), no centavo", () => {
  assert.equal(salePrice(22.4, 35), 30.24); // Abadá no painel atual: base 22,40, venda 30,24 (+35%)
  assert.equal(salePrice(7.25, 100), 14.5);
  assert.equal(grossProfit(22.4, 35), 7.84);
  const product = priceProduct({ price: 10, variations: [{ p: 10, pe: 15, q: 1, d: 3, v: {} }, { p: 0, q: 1, d: null, v: {} }] }, 50);
  assert.equal(product.price, 15);
  assert.deepEqual(
    product.variations.map((v) => [v.p, v.pe]),
    [
      [15, 22.5],
      [0, undefined],
    ],
  );
  // Fator da tabela base (multiloja abaixo do balcão).
  assert.equal(priceProduct({ price: 44.8, variations: [] }, 35, 0.5).price, 30.24);
});

test("plano: vagas de produto", () => {
  assert.equal(planRoom("gratis", 4), 6);
  assert.equal(planRoom("gratis", 12), 0);
  assert.equal(planRoom("premium", 500), Infinity);
});

test("paletas: branco no botão (texto grande) e cor escura legível em texto pequeno", () => {
  for (const key of PALETTE_KEYS) {
    const p = PALETTES[key];
    assert.ok(contrastRatio(p.main, "#ffffff") >= 3, `${key}: branco sobre main`);
    assert.ok(contrastRatio(p.hover, "#ffffff") >= 3, `${key}: branco sobre hover`);
    assert.ok(contrastRatio(p.dark, "#ffffff") >= 4.5, `${key}: dark sobre branco`);
    assert.ok(contrastRatio(p.dark, p.soft) >= 4.5, `${key}: dark sobre soft`);
  }
});

test("telefone e redes sociais", () => {
  assert.equal(phoneDigits("(21) 97114-8565"), "21971148565");
  assert.equal(phoneDigits("+55 21 97114-8565"), "21971148565");
  assert.equal(phoneDigits("123"), null);
  assert.equal(socialUrl("instagram", "@ana.atelie"), "https://www.instagram.com/ana.atelie/");
  assert.equal(socialUrl("instagram", "instagram.com/ana"), "https://instagram.com/ana");
  assert.equal(socialUrl("instagram", "https://evil.com/instagram.com"), null);
  assert.equal(socialUrl("youtube", ""), "");
});
