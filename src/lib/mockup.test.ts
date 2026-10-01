import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { colorsIn, DEFAULT_LED_COLORS, mockupSpec, normalizeName, resolveKind } from "./mockup.ts";
import { KIND_INFO, MOCKUP_KINDS, type MockupKind } from "./mockup-kinds.ts";
import { MOCKUP_OVERRIDES } from "./mockup-overrides.ts";

type CatalogProduct = { slug: string; name: string; categorySlug: string; options: Record<string, string[]> };

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as {
  products: CatalogProduct[];
};

function product(name: string): CatalogProduct {
  const wanted = normalizeName(name);
  const found = catalog.products.find((p) => normalizeName(p.name) === wanted);
  assert.ok(found, `produto não encontrado no catálogo: ${name}`);
  return found;
}

function spec(name: string, choose: Record<string, string> = {}) {
  const p = product(name);
  const selection: Record<string, string> = {};
  for (const [label, value] of Object.entries(choose)) {
    const key = Object.keys(p.options).find((k) => normalizeName(k).replace(/^\d+ - /, "") === normalizeName(label));
    assert.ok(key, `opção "${label}" não existe em ${name}`);
    selection[key] = value;
  }
  return mockupSpec(p, selection);
}

const EXPECTED: [string, MockupKind][] = [
  ["Boné", "cap"],
  ["Porta Copo", "coaster"],
  ["Porta Jarra Personalizado", "coaster"],
  ["Sousplat Personalizado em PVC", "coaster"],
  ["Bandana Pet", "bandana"],
  ["Bandana", "bandana"],
  ["Avental", "apron"],
  ["Avental Profissional", "apron"],
  ["Cama Pet", "petbed"],
  ["Chaveiro Acrílico", "keychain"],
  ["Base e Haste para Wind Banner", "hardware"],
  ["Haste para Wind Banner", "hardware"],
  ["Base Redonda p/ Wind Banner", "hardware"],
  ["Wind Banner Completo - Modelo Faca", "flag"],
  ["Wind Banner Tecido", "flag"],
  ["Tapete Sublimático", "rug"],
  ["Capacho", "rug"],
  ["Mouse Pad", "mat"],
  ["Tábua de Frios", "board"],
  ["Folder com Dobra 21x10cm", "folded"],
  ["Cardápio 42x29,7cm com 2 Dobras", "folded"],
  ["Pasta c/ Bolsa", "folded"],
  ["Lona Backlight", "lightbox"],
  ["Filme Backlight", "lightbox"],
  ["Garrafa Térmica com Copo", "bottle"],
  ["Copo Térmico", "tumbler"],
  ["Caneca Inox Travel Mug", "tumbler"],
  ["Caneca de Vidro de Chopp Jateada para Sublimação", "mug"],
  ["Xícara London 120ml para Sublimação", "mug"],
  ["Led Neon Caneca de Cerveja", "neon"],
  ["Camisa Polo", "tshirt"],
  ["Regata Basquete 01 até 10 unidades", "tshirt"],
  ["Cordão p/ Crachá", "cloth"],
  ["Crachá", "panel"],
  ["PS c/ Adesivo Aplicado", "panel"],
  ["Imã de Geladeira", "sticker"],
  ["Cartão de Visita", "card"],
  ["Cartão Postal 10x18cm", "sheet"],
  ["Quadro Decorativo em Acrílico", "acrylic"],
  ["Lixeira Pet p/ Automóveis", "bag"],
  ["Banner Roll Up Retrátil Personalizado", "rollup"],
  ["Display de Mesa de Papel", "tent"],
  ["Lona s/ Impressão", "banner"],
];

test("produtos conhecidos resolvem para o tipo certo", () => {
  for (const [name, kind] of EXPECTED) {
    assert.equal(resolveKind(product(name)).kind, kind, name);
  }
});

test("nome normalizado tira acento, então \\b funciona depois de 'é'", () => {
  assert.equal(normalizeName("  Boné   Trucker "), "bone trucker");
  assert.ok(/\bbone\b/.test(normalizeName("Boné")));
});

test("todo produto do catálogo resolve para um tipo registrado", () => {
  for (const p of catalog.products) {
    const { kind } = resolveKind(p);
    assert.ok((MOCKUP_KINDS as readonly string[]).includes(kind), `${p.name} → ${kind}`);
    assert.ok(KIND_INFO[kind], kind);
  }
});

test("contagem por tipo (snapshot; atualizar de propósito quando as regras mudarem)", () => {
  const counts: Record<string, number> = {};
  for (const p of catalog.products) {
    const { kind } = resolveKind(p);
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  assert.deepEqual(Object.fromEntries(Object.entries(counts).sort()), {
    acrylic: 4,
    apron: 3,
    bag: 22,
    bandana: 2,
    banner: 19,
    board: 3,
    book: 12,
    bottle: 14,
    box: 4,
    canvas: 1,
    cap: 1,
    card: 8,
    cloth: 19,
    coaster: 4,
    cushion: 12,
    flag: 9,
    folded: 8,
    hardware: 3,
    keychain: 1,
    lightbox: 2,
    mat: 3,
    mug: 27,
    neon: 33,
    panel: 18,
    petbed: 1,
    rollup: 1,
    rug: 2,
    sheet: 68,
    sticker: 28,
    tent: 2,
    tshirt: 24,
    tumbler: 3,
  });
});

test("só produtos sem modelo próprio caem no fallback", () => {
  const fallbacks = catalog.products.filter((p) => resolveKind(p).source === "fallback").map((p) => p.name);
  assert.deepEqual(fallbacks.sort(), [
    "Caneta p/ Porcelana",
    "Chinelo Personalizado",
    "Papel Foto Glossy 180g - Pct c/ 50",
    "Papel Sublimático Sublipaper - Pacote",
    "Papel de Parede",
  ]);
});

test("todo slug de override existe no catálogo", () => {
  const slugs = new Set(catalog.products.map((p) => p.slug));
  for (const slug of Object.keys(MOCKUP_OVERRIDES)) assert.ok(slugs.has(slug), slug);
});

test("cores citadas saem na ordem do texto, preferindo o termo mais longo", () => {
  assert.deepEqual(colorsIn("branca com alca e tampa preta"), ["#ffffff", "#1c1c1e"]);
  assert.deepEqual(colorsIn("azul claro"), ["#7cc4ef"]);
  assert.deepEqual(colorsIn("sem cor"), []);
});

test("cor do corpo, interior, alça e tampa vêm das opções", () => {
  assert.equal(spec("Caneca Mágica Personalizada").baseColor, "#1c1c1e");

  const interior = spec("Caneca com Alça e Interior Colorido Amarelo para Sublimação");
  assert.equal(interior.baseColor, "#ffffff");
  assert.equal(interior.innerColor, "#f4c51f");
  assert.equal(interior.accentColor, "#f4c51f");

  const travel = spec("Caneca Inox Travel Mug");
  assert.equal(travel.baseColor, "#ffffff");
  assert.equal(travel.accentColor, "#1c1c1e");
  assert.equal(travel.metal, "none");

  assert.equal(spec("Camisa de Algodão", { "Cor da Camisa": "Preta" }).baseColor, "#1c1c1e");
  assert.equal(spec("Camisa Polo", { Cor: "Preta" }).baseColor, "#1c1c1e");
  assert.equal(spec("Boné", { "Cor do Boné": "Preto" }).baseColor, "#1c1c1e");
  assert.equal(spec("Garrafa Térmica", { Cor: "Dourada" }).metal, "gold");

  const glitterBase = spec("Caneca de Cerâmica Branca com Glitter na Base");
  assert.equal(glitterBase.metal, "none");
  assert.equal(glitterBase.accentColor, "#d4af37");

  const bamboo = spec("Copo Vidro com Tampa Bambú");
  assert.equal(bamboo.glass, true);
  assert.equal(bamboo.accentColor, "#c9a46c");
});

test("cores de LED vêm da opção; sem opção usa o par padrão", () => {
  assert.deepEqual(spec("Led Neon Árvore de Natal").ledColors, ["#39ff7a", "#ffd9a0"]);
  assert.deepEqual(spec("Led Neon Love").ledColors.length > 0, true);
  assert.deepEqual(spec("Quadro Acrílico com Led Neon").ledColors, DEFAULT_LED_COLORS);
});

test("produtos sem impressão não recebem arte", () => {
  assert.equal(spec("Lona s/ Impressão").printable, false);
  assert.equal(spec("Adesivo s/ Impressão").printable, false);
  assert.equal(spec("Base e Haste para Wind Banner").printable, false);
  assert.equal(spec("Papel Foto Glossy 180g - Pct c/ 50").printable, false);
  assert.equal(spec("Cartão de Visita").printable, true);
});

test("formato vem das opções: redondo, oval e coração", () => {
  const roundTag = spec("Tag", { Formato: "4,8x4,8 cm (Redonda)" });
  assert.equal(roundTag.shape, "round");
  assert.equal(roundTag.widthCm, roundTag.heightCm);

  const ovalTag = spec("Tag", { Formato: "8,8x4,8 cm (Oval)" });
  assert.equal(ovalTag.shape, "round");
  assert.notEqual(ovalTag.widthCm, ovalTag.heightCm);

  assert.equal(spec("Porta Copo", { Modelo: "Redondo" }).shape, "round");
  assert.equal(spec("Porta Copo", { Modelo: "Quadrado" }).shape, "rect");
  assert.equal(spec("Mouse Pad", { Mídia: "Redondo" }).shape, "round");
  assert.equal(spec("Almofada Coração").shape, "heart");
  assert.equal(spec("Chaveiro Acrílico", { Formato: "5x5cm Quadrado com Pontas Arredondadas" }).shape, "rect");
});

test("vestuário, dobras, bandeiras e dupla face", () => {
  assert.equal(spec("Camisa com Manga Comprida").longSleeve, true);
  assert.equal(spec("Camisa Polo").collar, "polo");
  assert.equal(spec("Regata Basquete 01 até 10 unidades").sleeveless, true);
  assert.deepEqual([spec("Camisa de Algodão", { "Formato DTF": "28x40cm" }).widthCm, spec("Camisa de Algodão", { "Formato DTF": "28x40cm" }).heightCm], [28, 40]);
  assert.equal(spec("Cardápio 42x29,7cm com 2 Dobras").folds, 2);
  assert.equal(spec("Folder com Dobra 21x10cm").folds, 1);
  assert.equal(spec("Wind Banner Completo - Modelo Faca").flagStyle, "faca");
  assert.equal(spec("Wind Banner Completo - Modelo Gota").flagStyle, "gota");
  assert.equal(spec("Bandeira").flagStyle, "rect");
  assert.equal(spec("Lona Dupla Face").back, "same");
});
