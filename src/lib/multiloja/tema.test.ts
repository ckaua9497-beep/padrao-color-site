import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SECOES, MODELO_KEYS, SECOES_PRONTAS, aplicarModelo, imagensDoTema, parseTema, safeImage, safeLink, temaInicial, type LojaInfo, type Tema } from "./tema.ts";

const info: LojaInfo = { lojaId: 7, nome: "Ateliê Teste", slogan: "Presentes com a sua cara", sobre: "Somos uma loja de teste.", logo: null, paleta: "roxo", banners: [] };
const img = "/api/multiloja/arquivo/7/banner-0123456789abcdef.png";

test("modelos prontos: todos válidos, com a cor do lojista e o nome da loja nos textos", () => {
  for (const key of MODELO_KEYS) {
    const tema = aplicarModelo(key, info);
    assert.deepEqual(parseTema(JSON.parse(JSON.stringify(tema)), info), tema, key);
    assert.equal(tema.estilo.paleta, "roxo", key);
    assert.ok(tema.secoes.length >= 3, key);
    assert.equal(new Set(tema.secoes.map((s) => s.id)).size, tema.secoes.length, `${key}: ids únicos`);
  }
  assert.equal(aplicarModelo("boutique", info, { paleta: "grafite" }).estilo.paleta, "grafite");
  const hero = temaInicial(info).secoes[0];
  assert.equal(hero.tipo, "hero");
  assert.equal(hero.tipo === "hero" && hero.titulo, "Ateliê Teste");
});

test("loja com banners começa pelo carrossel com as imagens dela", () => {
  const tema = temaInicial({ ...info, banners: [{ src: img, alt: "Coleção", href: "/produtos" }] });
  const first = tema.secoes[0];
  assert.equal(first.tipo, "banners");
  assert.equal(first.tipo === "banners" && first.slides[0].src, img);
});

test("seções prontas: todas passam na validação sem mudar nada", () => {
  for (const pronta of SECOES_PRONTAS) {
    const secao = pronta.criar(info);
    const tema: Tema = { ...temaInicial(info), secoes: [secao] };
    assert.deepEqual(parseTema(tema, info).secoes[0], secao, pronta.chave);
  }
});

test("validação: imagem de outra loja, link externo e HTML viram valores seguros", () => {
  const raw = {
    v: 1,
    modelo: "inventado",
    marca: { logo: "/api/multiloja/arquivo/8/logo-0123456789abcdef.png" },
    estilo: { paleta: "neon", fonte: "comic", cantos: "retos" },
    cabecalho: { estilo: "centralizado", aviso: "a".repeat(500), busca: "sim" },
    secoes: [
      { tipo: "hero", id: "x", titulo: "Oi\n<script>", link: "https://golpe.com", imagem: "https://golpe.com/a.png", botao2: "telefone" },
      { tipo: "banners", id: "x", slides: [{ src: img, href: "//golpe.com" }, { src: "/api/multiloja/arquivo/7/../../segredo.png" }] },
      { tipo: "desconhecida" },
    ],
  };
  const tema = parseTema(raw, info);
  assert.equal(tema.modelo, "personalizado");
  assert.equal(tema.marca.logo, null);
  assert.equal(tema.estilo.paleta, "roxo"); // volta para a cor da loja
  assert.equal(tema.estilo.fonte, "figtree");
  assert.equal(tema.estilo.cantos, "retos");
  assert.equal(tema.cabecalho.aviso.length, 120);
  assert.equal(tema.cabecalho.busca, true);
  assert.equal(tema.secoes.length, 2);
  const [hero, banners] = tema.secoes;
  assert.ok(hero.tipo === "hero" && hero.link === "/produtos" && hero.imagem === null && hero.botao2 === "nenhum" && !hero.titulo.includes("\n"));
  assert.ok(banners.tipo === "banners" && banners.slides.length === 1 && banners.slides[0].href === null);
  assert.notEqual(hero.id, banners.id, "ids repetidos são trocados");
});

test("validação: limites de seções e lixo", () => {
  const muitas = { ...temaInicial(info), secoes: Array.from({ length: 40 }, () => ({ tipo: "categorias", titulo: "x" })) };
  assert.equal(parseTema(muitas, info).secoes.length, MAX_SECOES);
  assert.equal(parseTema("{não é json", info).modelo, "classico");
  assert.equal(parseTema(null, info).v, 1);
  assert.equal(parseTema({ v: 2 }, info).modelo, "classico");
});

test("links e imagens seguros; imagens usadas pelo tema", () => {
  assert.equal(safeLink("/produtos?categoria=vestuario"), "/produtos?categoria=vestuario");
  assert.equal(safeLink("//evil.com"), "/produtos");
  assert.equal(safeLink("javascript:alert(1)"), "/produtos");
  assert.equal(safeImage(img, 7), img);
  assert.equal(safeImage(img, 8), null);
  const tema = { ...temaInicial(info), marca: { logo: img }, secoes: [...temaInicial(info).secoes] };
  assert.deepEqual(imagensDoTema(tema), [img]);
});

test("produtos de cada vitrine: destaques, novidades, categoria e escolhidos", async () => {
  const { produtosDaSecao } = await import("./tema.ts");
  const ps = [
    { id: "1", categorySlug: "vestuario", featured: false, ativadoEm: "2026-10-01 10:00:00" },
    { id: "2", categorySlug: "brindes", featured: true, ativadoEm: "2026-10-02 10:00:00" },
    { id: "3", categorySlug: "vestuario", featured: false, ativadoEm: "2026-10-05 10:00:00" },
  ];
  const ids = (list: { id: string }[]) => list.map((p) => p.id).join(",");
  assert.equal(ids(produtosDaSecao({ fonte: "destaques", categoria: null, escolhidos: [], quantidade: 4 }, ps)), "2,1,3");
  assert.equal(ids(produtosDaSecao({ fonte: "novidades", categoria: null, escolhidos: [], quantidade: 4 }, ps)), "3,2,1");
  assert.equal(ids(produtosDaSecao({ fonte: "categoria", categoria: "vestuario", escolhidos: [], quantidade: 4 }, ps)), "1,3");
  assert.equal(ids(produtosDaSecao({ fonte: "categoria", categoria: null, escolhidos: [], quantidade: 4 }, ps)), "");
  assert.equal(ids(produtosDaSecao({ fonte: "escolhidos", categoria: null, escolhidos: ["3", "9", "1"], quantidade: 4 }, ps)), "3,1");
  assert.equal(produtosDaSecao({ fonte: "destaques", categoria: null, escolhidos: [], quantidade: 4 }, ps).length, 3);
});
