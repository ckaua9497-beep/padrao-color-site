import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { colorsIn, DEFAULT_LED_COLORS, mockupSpec, normalizeName, resolveKind } from "./mockup.ts";
import { KIND_INFO, MOCKUP_KINDS, PAGE_KINDS, type MockupKind } from "./mockup-kinds.ts";
import { MOCKUP_OVERRIDES } from "./mockup-overrides.ts";

type CatalogProduct = { slug: string; name: string; categorySlug: string; options: Record<string, string[]> };

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as {
  products: CatalogProduct[];
};
/** Produtos novos da API própria (sync:novos): entram nos testes de cobertura, não no snapshot da Padrão. */
const novos = JSON.parse(readFileSync(new URL("../data/catalog-novos.json", import.meta.url), "utf8")) as { products: CatalogProduct[] };
const allProducts = [...catalog.products, ...novos.products];

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
  ["Caneca de Chopp Jateada", "mug"],
  ["Caneca Personalizada com Alça de Coração", "mug"],
  ["Xícara London 120ml para Sublimação", "mug"],
  ["Led Neon Caneca de Cerveja", "neon"],
  ["Camisa Polo", "tshirt"],
  ["Regata Basquete 01 até 10 unidades", "tshirt"],
  ["Cordão p/ Crachá", "lanyard"],
  ["Crachá", "badge"],
  ["Credencial", "badge"],
  ["PS c/ Adesivo Aplicado", "panel"],
  ["Imã de Geladeira", "magnet"],
  ["Manta de Imã Adesiva", "magnet"],
  ["Calendário para Imã de Geladeira", "magnet"],
  ["Chinelo Personalizado", "flipflop"],
  ["Caneta Personalizada", "pen"],
  ["Caneta p/ Porcelana", "pen"],
  ["Papel de Parede", "wallpaper"],
  ["Papel Foto Glossy 180g - Pct c/ 50", "paperpack"],
  ["Papel Sublimático Sublipaper - Pacote", "paperpack"],
  ["Papel Sublimático", "sheet"],
  ["Calendário de Parede", "wallcalendar"],
  ["Calendário de Bolso", "card"],
  ["Ventarola", "fan"],
  ["Pulseira de Identificação", "wristband"],
  ["Tag", "hangtag"],
  ["Marcador de Livro", "bookmark"],
  ["Porta Passaporte", "passport"],
  ["Meia Personalizada", "sock"],
  ["Short de Futebol", "shorts"],
  ["Maiô Infantil", "swimsuit"],
  ["Quebra Cabeça", "puzzle"],
  ["Régua", "ruler"],
  ["Suporte para Celular em PVC", "phonestand"],
  ["Wobbler", "wobbler"],
  ["Máscara de Dormir", "sleepmask"],
  ["Almofada para Pescoço", "neckpillow"],
  ["Kit Soneca", "neckpillow"],
  ["Almofada c/ Suporte para Notebook", "lapdesk"],
  ["Almofada Quadrada", "cushion"],
  ["Sacola Mochila", "drawstring"],
  ["Mochila Personalizada", "backpack"],
  ["Cooler Personalizado", "cooler"],
  ["Lancheira Brinde", "cooler"],
  ["Bolsa Cilindro", "duffel"],
  ["Bolsa Esportiva de Mão", "duffel"],
  ["Ecobag Personalizada", "bag"],
  ["Toalha de Praia", "towel"],
  ["Canga", "towel"],
  ["Toalha de Mesa", "tablecloth"],
  ["Toalha Piquenique", "tablecloth"],
  ["Cortina Personalizada", "curtain"],
  ["Lençol Personalizado", "bedding"],
  ["Capa p/ Cilindro de Festa", "cylinder"],
  ["Guardanapo Personalizado", "cloth"],
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
    acrylic: 5,
    apron: 3,
    backpack: 2,
    badge: 2,
    bag: 12,
    bandana: 2,
    banner: 19,
    bedding: 1,
    board: 3,
    book: 12,
    bookmark: 2,
    bottle: 14,
    box: 4,
    canvas: 1,
    cap: 1,
    card: 5,
    cloth: 5,
    coaster: 4,
    cooler: 2,
    curtain: 1,
    cushion: 8,
    cylinder: 1,
    drawstring: 2,
    duffel: 2,
    fan: 1,
    flag: 9,
    flipflop: 1,
    folded: 8,
    hangtag: 1,
    hardware: 3,
    keychain: 1,
    lanyard: 1,
    lapdesk: 1,
    lightbox: 2,
    magnet: 5,
    mat: 3,
    mug: 12,
    neckpillow: 2,
    neon: 33,
    panel: 11,
    paperpack: 2,
    passport: 1,
    pen: 3,
    petbed: 1,
    phonestand: 1,
    puzzle: 1,
    rollup: 1,
    rug: 2,
    ruler: 1,
    sheet: 60,
    shorts: 1,
    sleepmask: 1,
    sock: 1,
    sticker: 22,
    swimsuit: 1,
    tablecloth: 2,
    tent: 2,
    towel: 5,
    tshirt: 24,
    tumbler: 3,
    wallcalendar: 1,
    wallpaper: 1,
    wobbler: 1,
    wristband: 1,
  });
});

test("todo tipo registrado tem pelo menos um produto (nenhum modelo órfão)", () => {
  const used = new Set(allProducts.map((p) => resolveKind(p).kind));
  // A fachada de loja (PAGE_KINDS) é usada pelo simulador de fachadas, não por um produto.
  assert.deepEqual(MOCKUP_KINDS.filter((kind) => !used.has(kind) && !PAGE_KINDS.includes(kind)), []);
});

test("nenhum produto cai no fallback genérico", () => {
  const fallbacks = allProducts.filter((p) => resolveKind(p).source === "fallback").map((p) => p.name);
  assert.deepEqual(fallbacks, []);
});

test("todo slug de override existe no catálogo", () => {
  const slugs = new Set(allProducts.map((p) => p.slug));
  for (const slug of Object.keys(MOCKUP_OVERRIDES)) assert.ok(slugs.has(slug), slug);
});

test("cores citadas saem na ordem do texto, preferindo o termo mais longo", () => {
  assert.deepEqual(colorsIn("branca com alca e tampa preta"), ["#ffffff", "#1c1c1e"]);
  assert.deepEqual(colorsIn("azul claro"), ["#7cc4ef"]);
  assert.deepEqual(colorsIn("sem cor"), []);
});

test("cor do corpo, interior, alça e tampa vêm das opções", () => {
  assert.equal(spec("Caneca Mágica").baseColor, "#1c1c1e");

  // Desde 23/10/2026 as canecas por cor viraram opção Cor dentro do grupo.
  const interior = spec("Caneca com Alça e Interior Colorido", { Cor: "Amarela" });
  assert.equal(interior.baseColor, "#ffffff");
  assert.equal(interior.innerColor, "#f4c51f");
  assert.equal(interior.accentColor, "#f4c51f");

  const spoon = spec("Caneca de Cerâmica c/ Colher e Interior Colorido", { Cor: "Branca com Colher e Interior Vermelho" });
  assert.equal(spoon.baseColor, "#ffffff");
  assert.equal(spoon.innerColor, "#d7262b");
  assert.equal(spoon.accentColor, "#d7262b");

  const heart = spec("Caneca Personalizada com Alça de Coração", { Cor: "Branco com Vermelho" });
  assert.equal(heart.variant, "heart-handle");
  assert.equal(heart.baseColor, "#ffffff");
  assert.equal(heart.innerColor, "#d7262b");
  assert.equal(heart.accentColor, "#d7262b");

  const chrome = spec("Caneca Cromada", { Cor: "Rosê Gold" });
  assert.equal(chrome.metal, "rose");
  assert.equal(chrome.finish, "gloss");

  const bronze = spec("Caneca C/ Glitter", { Cor: "Glitter Bronze" });
  assert.equal(bronze.glitter, true);
  assert.equal(bronze.baseColor, "#cd7f32");
  assert.equal(spec("Caneca C/ Glitter", { Cor: "Glitter Prata" }).metal, "silver");

  const travel = spec("Caneca Inox Travel Mug");
  assert.equal(travel.baseColor, "#ffffff");
  assert.equal(travel.accentColor, "#1c1c1e");
  assert.equal(travel.metal, "none");

  assert.equal(spec("Camisa de Algodão", { "Cor da Camisa": "Preta" }).baseColor, "#1c1c1e");
  assert.equal(spec("Camisa Polo", { Cor: "Preta" }).baseColor, "#1c1c1e");
  assert.equal(spec("Boné", { "Cor do Boné": "Preto" }).baseColor, "#1c1c1e");
  assert.equal(spec("Garrafa Térmica", { Cor: "Dourada" }).metal, "gold");

  // A "Caneca Personalizada com Glitter na Base" (532) vem com erro da API e fica fora do catálogo: a regra da faixa
  // de glitter é conferida com a cor da antiga 432 ("Branca com Base Dourada").
  const glitter = product("Caneca C/ Glitter");
  const glitterBase = mockupSpec({ ...glitter, name: "Caneca de Cerâmica Branca com Glitter na Base", options: { Cor: ["Branca com Base Dourada"] } }, {});
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

test("produtos vendidos sem impressão ficam marcados como blank (a arte vira simulação)", () => {
  for (const name of [
    "Lona s/ Impressão",
    "Adesivo s/ Impressão",
    "Base e Haste para Wind Banner",
    "Papel Foto Glossy 180g - Pct c/ 50",
    "Caneca Branca AAA Live Sub para Sublimação",
    "Ecobag para Sublimação",
    "Capa para Almofada Sublimável",
  ]) {
    assert.equal(spec(name).blank, true, name);
  }
  // "Material: Emborrachado Sublimável" é o serviço de sublimação, não peça crua.
  for (const name of ["Cartão de Visita", "Porta Copo", "Kit Executivo", "Caneca de Cerâmica Personalizada"]) {
    assert.equal(spec(name).blank, false, name);
  }
});

test("subtipos vêm do nome, não de regex dentro dos modelos", () => {
  assert.equal(spec("Caneca de Cerâmica c/ Colher e Interior Colorido").variant, "spoon");
  assert.equal(spec("Xícara London com Suporte - Kit com 2 unidades").variant, "kit");
  assert.equal(spec("Kit Soneca").variant, "kit");
  assert.equal(spec("Lancheira Brinde").variant, "lunch");
  assert.equal(spec("Toalha Piquenique").variant, "picnic");
  assert.equal(spec("Caneta p/ Porcelana").variant, "porcelain");
  assert.equal(spec("Base Redonda p/ Wind Banner").variant, "round-base");
  assert.equal(spec("Wind Ball").variant, "ball");
  assert.equal(spec("Lixeira Pet p/ Automóveis").variant, "car-trash");
  assert.equal(spec("Caneca de Cerâmica Personalizada").variant, null);
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
