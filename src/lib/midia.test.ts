import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisoDeTamanho,
  bannersNoAr,
  categoriaComMidia,
  comPadrao,
  dimensoesImagem,
  fotosDoProduto,
  imagemPermitida,
  imagensEmUso,
  lerBanner,
  lerBanners,
  lerMidiaCategoria,
  lerMidiaProduto,
  linhasDeFaixas,
  linkPermitido,
  MIDIA_VAZIA,
  montarMidia,
  origemDaFoto,
  produtoComMidia,
  statusDoBanner,
  type Banner,
  type Midia,
} from "./midia.ts";
import { MIDIA_PADRAO } from "./midia-padrao.ts";
import { existsSync } from "node:fs";

const API = "https://img.padraocolor.com.br/padraocolor/imagens/grupos/img_img_abada em dryfit.webp";
const API2 = "https://img.padraocolor.com.br/padraocolor/imagens/produtos/img1_produto_abada vies branco.png";
const MINHA = "/api/site/imagem/produto-1a2b3c4d5e6f7a8b.webp";
const MINHA2 = "/api/site/imagem/produto-9f8e7d6c5b4a3f2e.png";

const banner = (over: Partial<Banner> = {}): Banner => ({
  id: "b-123456",
  desktop: { src: "/api/site/imagem/banner-1a2b3c4d5e6f7a8b.webp", w: 1900, h: 458 },
  mobile: null,
  alt: "Cartões de visita",
  href: "/categoria/cartoes-de-visita-e-postais",
  novaAba: false,
  ativo: true,
  inicio: null,
  fim: null,
  ...over,
});

test("fotos do produto: as próprias primeiro (a primeira é a capa); da API só se pedir, sem repetir", () => {
  assert.deepEqual(fotosDoProduto([API, API2], API, undefined), { image: API, images: [API, API2] });
  assert.deepEqual(fotosDoProduto([API, API2], API, { imagens: [MINHA], manterApi: false }), { image: MINHA, images: [MINHA] });
  assert.deepEqual(fotosDoProduto([API, API2], API, { imagens: [MINHA, API2], manterApi: true }), { image: MINHA, images: [MINHA, API2, API] });
  // Lista vazia = sem troca.
  assert.deepEqual(fotosDoProduto([API], API, { imagens: [], manterApi: false }), { image: API, images: [API] });
});

test("produto e card com a troca, pelo id do catálogo; sem troca, o mesmo objeto", () => {
  const midia: Midia = { ...MIDIA_VAZIA, produtos: { "466": { imagens: [MINHA, MINHA2], manterApi: false } } };
  const produto = { id: "466", groupId: 466, image: API, images: [API, API2] };
  assert.deepEqual(produtoComMidia(produto, midia), { id: "466", groupId: 466, image: MINHA, images: [MINHA, MINHA2] });
  const card = { id: "466", groupId: 466, image: API };
  assert.deepEqual(produtoComMidia(card, midia), { id: "466", groupId: 466, image: MINHA });
  // "tags" vem do grupo 180, mas tem id próprio: a troca de um não vale para o outro.
  const tags = { id: "tags", groupId: 466, image: API };
  assert.equal(produtoComMidia(tags, midia), tags);
});

test("categoria: imagem e banner trocados; banner sem versão de celular não mistura com o da API", () => {
  const midia: Midia = { ...MIDIA_VAZIA, categorias: { vestuario: { imagem: MINHA, banner: MINHA2, bannerMobile: null } } };
  const cat = { slug: "vestuario", image: API, banner: API, bannerMobile: API2 };
  assert.deepEqual(categoriaComMidia(cat, midia), { slug: "vestuario", image: MINHA, banner: MINHA2, bannerMobile: null });
  const soImagem: Midia = { ...MIDIA_VAZIA, categorias: { vestuario: { imagem: MINHA, banner: null, bannerMobile: null } } };
  assert.deepEqual(categoriaComMidia(cat, soImagem), { slug: "vestuario", image: MINHA, banner: API, bannerMobile: API2 });
});

test("banners no ar: ligados e dentro do período", () => {
  const lista = [banner({ id: "b-aaaaaa" }), banner({ id: "b-bbbbbb", ativo: false }), banner({ id: "b-cccccc", inicio: "2026-10-20" }), banner({ id: "b-dddddd", fim: "2026-10-13" }), banner({ id: "b-eeeeee", inicio: "2026-10-14", fim: "2026-10-14" })];
  assert.deepEqual(bannersNoAr(lista, "2026-10-14").map((b) => b.id), ["b-aaaaaa", "b-eeeeee"]);
});

test("imagens e links aceitos", () => {
  assert.ok(imagemPermitida(MINHA));
  assert.ok(imagemPermitida(API));
  assert.ok(!imagemPermitida("/api/site/imagem/../segredo.png"));
  assert.ok(!imagemPermitida("https://outro-site.com/foto.png"));
  assert.ok(!imagemPermitida('https://img.padraocolor.com.br/padraocolor/imagens/x".png'));
  assert.ok(linkPermitido("/categoria/vestuario"));
  assert.ok(linkPermitido("https://padraocolor.com.br/institucional/seja-um-revendedor"));
  assert.ok(!linkPermitido("//evil.com"));
  assert.ok(!linkPermitido("javascript:alert(1)"));
  assert.ok(!linkPermitido("http://inseguro.com"));
});

test("banner do admin: confere imagem, texto alternativo, link e datas", () => {
  assert.equal(lerBanner(banner()).ok, true);
  assert.deepEqual(lerBanner({ ...banner(), alt: "  " }), { ok: false, erro: "Escreva o texto alternativo (o que o banner mostra, para quem não vê a imagem)." });
  assert.equal(lerBanner({ ...banner(), href: "javascript:alert(1)" }).ok, false);
  assert.equal(lerBanner({ ...banner(), desktop: { src: "https://outro.com/x.png", w: 10, h: 10 } }).ok, false);
  assert.deepEqual(lerBanner({ ...banner(), inicio: "2026-10-20", fim: "2026-10-10" }), { ok: false, erro: "A data de fim vem antes da de início." });
  // Data em formato errado vira "sem limite"; ativo só desliga com false.
  const lido = lerBanner({ ...banner(), inicio: "20/10/2026", ativo: undefined });
  assert.ok(lido.ok && lido.valor.inicio === null && lido.valor.ativo === true);
  assert.equal(lerBanners([banner(), banner()], "inicio-topo").ok, false);
  assert.equal(lerBanners(Array.from({ length: 10 }, (_, i) => banner({ id: `b-${String(i).padStart(6, "0")}` })), "inicio-meio").ok, false);
});

test("fotos e categoria do admin: só imagens aceitas", () => {
  assert.deepEqual(lerMidiaProduto({ imagens: [MINHA, MINHA, API], manterApi: true }), { ok: true, valor: { imagens: [MINHA, API], manterApi: true } });
  assert.equal(lerMidiaProduto({ imagens: ["https://outro.com/x.png"] }).ok, false);
  assert.deepEqual(lerMidiaCategoria({ imagem: MINHA, banner: "", bannerMobile: null }), { ok: true, valor: { imagem: MINHA, banner: null, bannerMobile: null } });
  assert.equal(lerMidiaCategoria({ bannerMobile: MINHA }).ok, false);
});

test("montar do banco: descarta o quebrado; imagens em uso para a limpeza", () => {
  const midia = montarMidia([
    { chave: "produto/466", valor: JSON.stringify({ imagens: [MINHA], manterApi: false }) },
    { chave: "produto/5", valor: "{quebrado" },
    { chave: "categoria/vestuario", valor: JSON.stringify({ imagem: null, banner: MINHA2, bannerMobile: null }) },
    { chave: "banners/inicio-topo", valor: JSON.stringify([banner()]) },
    { chave: "banners/outro-lugar", valor: JSON.stringify([banner()]) },
  ]);
  assert.deepEqual(Object.keys(midia.produtos), ["466"]);
  assert.equal(midia.categorias.vestuario.banner, MINHA2);
  assert.equal(midia.banners["inicio-topo"].length, 1);
  assert.deepEqual([...imagensEmUso(midia)].sort(), ["banner-1a2b3c4d5e6f7a8b.webp", "produto-1a2b3c4d5e6f7a8b.webp", "produto-9f8e7d6c5b4a3f2e.png"]);
});

test("tamanho da imagem pelo cabeçalho: PNG, JPEG e WebP (com e sem perda, estendido)", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  png.set([0, 0, 0x07, 0x6c, 0, 0, 0x01, 0xca], 16); // 1900 × 458
  assert.deepEqual(dimensoesImagem(png), { w: 1900, h: 458 });

  // JPEG: SOI, um APP0 curto e o SOF0 com altura 205 e largura 615.
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xcd, 0x02, 0x67, 0x03, 0, 0, 0, 0]);
  assert.deepEqual(dimensoesImagem(jpg), { w: 615, h: 205 });

  const riff = (chunk: string, body: number[]) => {
    const b = new Uint8Array(30);
    b.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), ...Buffer.from(chunk), 0, 0, 0, 0]);
    b.set(body, 20);
    return b;
  };
  // VP8: tag de quadro (3 bytes), código 9d 01 2a, largura 900 e altura 500 (14 bits, little-endian).
  assert.deepEqual(dimensoesImagem(riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, 0x84, 0x03, 0xf4, 0x01])), { w: 900, h: 500 });
  // VP8L: assinatura 0x2f e (largura-1) | (altura-1) << 14 em 32 bits: 600 × 600.
  const bits = 599 | (599 << 14);
  assert.deepEqual(dimensoesImagem(riff("VP8L", [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff])), { w: 600, h: 600 });
  // VP8X: largura-1 e altura-1 em 24 bits nos bytes 24–29: 1240 × 800.
  assert.deepEqual(dimensoesImagem(riff("VP8X", [0, 0, 0, 0, 1239 & 0xff, 1239 >> 8, 0, 799 & 0xff, 799 >> 8, 0])), { w: 1240, h: 800 });

  assert.equal(dimensoesImagem(new Uint8Array([1, 2, 3])), null);
});

test("situação do banner e aviso de tamanho no admin", () => {
  assert.deepEqual(statusDoBanner(banner(), "2026-10-14"), { tom: "ok", texto: "No ar" });
  assert.deepEqual(statusDoBanner(banner({ fim: "2026-10-31" }), "2026-10-14"), { tom: "ok", texto: "No ar até 31/10" });
  assert.deepEqual(statusDoBanner(banner({ inicio: "2026-10-20" }), "2026-10-14"), { tom: "warn", texto: "Entra no ar em 20/10" });
  assert.deepEqual(statusDoBanner(banner({ fim: "2026-10-13" }), "2026-10-14"), { tom: "off", texto: "Saiu do ar em 13/10" });
  assert.deepEqual(statusDoBanner(banner({ ativo: false }), "2026-10-14"), { tom: "off", texto: "Desligado" });
  const ideal = { w: 1900, h: 458 };
  assert.equal(avisoDeTamanho({ src: "x", w: 1900, h: 458 }, ideal), null);
  assert.match(avisoDeTamanho({ src: "x", w: 1200, h: 800 }, ideal) ?? "", /Proporção diferente/);
  assert.match(avisoDeTamanho({ src: "x", w: 950, h: 229 }, ideal) ?? "", /Imagem estreita/);
  // Faixas aceitam qualquer proporção: só a largura conta.
  assert.equal(avisoDeTamanho({ src: "x", w: 1240, h: 300 }, { w: 615, h: 205 }, false), null);
});

test("faixas em linhas: pela linha escolhida (sem linha, fica na da anterior); sem nenhuma, três por linha", () => {
  const f = (id: string, linha: number | null) => ({ id, linha });
  assert.deepEqual(
    linhasDeFaixas([f("a", 1), f("b", 1), f("c", 1), f("d", 2), f("e", 2), f("f", null)]).map((l) => l.map((x) => x.id)),
    [["a", "b", "c"], ["d", "e", "f"]],
  );
  assert.deepEqual(linhasDeFaixas([f("d", 2), f("a", 1)]).map((l) => l.map((x) => x.id)), [["a"], ["d"]]);
  assert.deepEqual(linhasDeFaixas([f("a", null), f("b", null), f("c", null), f("d", null)]).map((l) => l.map((x) => x.id)), [["a", "b", "c"], ["d"]]);
  assert.deepEqual(linhasDeFaixas([]), []);
  const comLinha = lerBanner({ ...banner(), linha: 2 });
  assert.ok(comLinha.ok && comLinha.valor.linha === 2);
  const foraDoLimite = lerBanner({ ...banner(), linha: 40 });
  assert.ok(foraDoLimite.ok && foraDoLimite.valor.linha === null);
});

test("imagens padrão do site: arquivos que existem em public/, aceitos pela validação e com banners válidos", () => {
  const caminhos = [
    ...Object.values(MIDIA_PADRAO.produtos).flatMap((p) => p.imagens),
    ...Object.values(MIDIA_PADRAO.categorias).map((c) => c.imagem as string),
    ...Object.values(MIDIA_PADRAO.banners).flat().flatMap((b) => [b.desktop.src, b.mobile?.src as string]),
  ];
  for (const src of caminhos) {
    assert.ok(imagemPermitida(src), src);
    assert.ok(existsSync(new URL(`../../public${src}`, import.meta.url)), `falta o arquivo ${src}`);
  }
  for (const lugar of ["inicio-topo", "inicio-meio"] as const) assert.equal(lerBanners(MIDIA_PADRAO.banners[lugar], lugar).ok, true, lugar);
  assert.ok(imagemPermitida("/produtos-novos/adesivo-fechar-sacola.webp"));
  assert.ok(!imagemPermitida("/site/produtos/../segredo.webp"));
  assert.ok(!imagemPermitida("/site/outra/foto.webp"));
});

test("o admin por cima do padrão: produto por produto, categoria campo a campo e a lista de banners salva", () => {
  const padrao: Midia = {
    produtos: { "470": { imagens: ["/site/produtos/470.webp"], manterApi: true }, "5": { imagens: ["/site/produtos/5.webp"], manterApi: true } },
    categorias: { folhetos: { imagem: "/site/categorias/folhetos.webp", banner: null, bannerMobile: null } },
    banners: { "inicio-topo": [banner({ id: "padrao-1" })], "inicio-meio": [banner({ id: "padrao-2" })] },
  };
  const banco: Midia = {
    produtos: { "470": { imagens: [MINHA], manterApi: false } },
    categorias: { folhetos: { imagem: null, banner: MINHA, bannerMobile: null }, suprimentos: { imagem: MINHA2, banner: null, bannerMobile: null } },
    banners: { "inicio-topo": [banner({ id: "salvo-1", ativo: false })], "inicio-meio": [] },
  };
  const m = comPadrao(banco, padrao);
  assert.deepEqual(m.produtos["470"], { imagens: [MINHA], manterApi: false }, "o salvo ganha");
  assert.deepEqual(m.produtos["5"].imagens, ["/site/produtos/5.webp"], "sem registro, o padrão");
  assert.deepEqual(m.categorias.folhetos, { imagem: "/site/categorias/folhetos.webp", banner: MINHA, bannerMobile: null }, "banner salvo não apaga a imagem padrão");
  assert.equal(m.categorias.suprimentos.imagem, MINHA2);
  assert.deepEqual(m.banners["inicio-topo"].map((b) => b.id), ["salvo-1"], "lista salva (mesmo desligada) ganha");
  assert.deepEqual(m.banners["inicio-meio"].map((b) => b.id), ["padrao-2"], "sem lista salva, a padrão");
  assert.deepEqual(comPadrao(MIDIA_VAZIA, padrao), padrao);
});

test("origem da foto no admin: enviada, padrão do próprio produto ou da API dele; o resto não vale", () => {
  const fontes = { api: [API, API2], padrao: ["/site/produtos/470.webp", "/site/produtos/470-2.webp"] };
  assert.equal(origemDaFoto(MINHA, fontes), "enviada");
  assert.equal(origemDaFoto("/site/produtos/470-2.webp", fontes), "padrao");
  assert.equal(origemDaFoto(API2, fontes), "api");
  // Imagem padrão de outro produto, foto da API de outro produto e caminho forjado: recusados.
  assert.equal(origemDaFoto("/site/produtos/348.webp", fontes), null);
  assert.equal(origemDaFoto("https://img.padraocolor.com.br/padraocolor/imagens/grupos/outro.webp", fontes), null);
  assert.equal(origemDaFoto("/api/site/imagem/../segredo.png", fontes), null);
  // Sem padrão (a maioria dos produtos), só as enviadas e as da API.
  assert.equal(origemDaFoto("/site/produtos/470.webp", { api: [API], padrao: [] }), null);
  // As fotos padrão do site passam na validação de quem salva (lerMidiaProduto) e são do produto certo.
  const padrao470 = MIDIA_PADRAO.produtos["470"];
  assert.equal(lerMidiaProduto(padrao470).ok, true);
  assert.ok(padrao470.imagens.every((src) => origemDaFoto(src, { api: [], padrao: padrao470.imagens }) === "padrao"));
});
