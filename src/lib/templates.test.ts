import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aspectGap,
  autoPlacementFor,
  orientPages,
  pieceKey,
  piecesOf,
  placementFromVisual,
  printsBack,
  autoPlacement,
  bleedFractions,
  boxFromPlacement,
  containBox,
  coverBox,
  croppedShare,
  describePanel,
  dpiAt,
  formatMm,
  formatSides,
  hasBackPanel,
  leavesBleedUncovered,
  matchArtwork,
  normalizeSize,
  pagesFor,
  panelFor,
  parametricPage,
  pixelsFor,
  placeArtwork,
  placementFromBox,
  sideOf,
} from "./templates.ts";
import type { Box, ProductTemplate, TemplatePage, TemplatePanel } from "./templates.ts";

/*
 * Testes do encaixe da arte nos gabaritos com folhas montadas à mão (sem depender de src/data/templates.json):
 *   - QUADRADO: peça 50×50 mm, sangria 2 mm, segurança 4 mm, numa folha 54×54 mm;
 *   - CAMISA:   folha 1000×600 mm com frente e costas lado a lado (sangria 10 mm, segurança 30 mm);
 *   - A4:       folha retrato 210×297 mm sem sangria (o corte é a própria folha).
 */

// ---------------------------------------------------------------------------------------------- fixtures

const uniform = (v: number) => ({ top: v, right: v, bottom: v, left: v });

const SQUARE_PANEL: TemplatePanel = {
  bleed: { x: 0, y: 0, w: 54, h: 54 },
  cut: { x: 2, y: 2, w: 50, h: 50, shape: "rect" },
  safe: { x: 6, y: 6, w: 42, h: 42, shape: "rect" },
  metrics: { finalMm: { w: 50, h: 50 }, bleedMm: uniform(2), safeMm: uniform(4) },
};
const SQUARE: TemplatePage = { id: "quadrado-5x5", label: "5 × 5 cm", sheet: { w: 54, h: 54 }, panels: [SQUARE_PANEL] };

const FRONT: TemplatePanel = {
  name: "Frente",
  side: "front",
  bleed: { x: 20, y: 20, w: 440, h: 560 },
  cut: { x: 30, y: 30, w: 420, h: 540, shape: "custom", d: "M30 30H450V570H30Z" },
  safe: { x: 60, y: 60, w: 360, h: 480, shape: "rect" },
  sew: "M40 40H440",
  metrics: { finalMm: { w: 420, h: 540 }, bleedMm: uniform(10), safeMm: uniform(30) },
};
const BACK: TemplatePanel = {
  name: "Costas",
  side: "back",
  bleed: { x: 540, y: 20, w: 440, h: 560 },
  cut: { x: 550, y: 30, w: 420, h: 540, shape: "custom", d: "M550 30H970V570H550Z" },
  safe: { x: 580, y: 60, w: 360, h: 480, shape: "rect" },
  metrics: { finalMm: { w: 420, h: 540 }, bleedMm: uniform(10), safeMm: uniform(30) },
};
const SHIRT: TemplatePage = { id: "camisa-m", label: "Camisa M", size: "M", sheet: { w: 1000, h: 600 }, panels: [FRONT, BACK] };

const A4_PANEL: TemplatePanel = {
  bleed: { x: 0, y: 0, w: 210, h: 297 },
  implicitBleed: true,
  cut: { x: 0, y: 0, w: 210, h: 297, shape: "rect" },
  safe: { x: 5, y: 5, w: 200, h: 287, shape: "rect" },
  metrics: { finalMm: { w: 210, h: 297 }, bleedMm: uniform(0), safeMm: uniform(5) },
};
const A4: TemplatePage = { id: "a4", label: "A4", sheet: { w: 210, h: 297 }, panels: [A4_PANEL] };

const PHOTO_16_9 = { w: 1920, h: 1080 };

/** Compara números com folga (geometria em ponto flutuante). */
function near(actual: number, expected: number, eps = 1e-6, msg?: string) {
  assert.ok(Math.abs(actual - expected) <= eps, msg ?? `esperado ${expected}, veio ${actual}`);
}
function nearBox(actual: Box, expected: Box, eps = 1e-6) {
  for (const k of ["x", "y", "w", "h"] as const) near(actual[k], expected[k], eps, `${k}: esperado ${expected[k]}, veio ${actual[k]}`);
}

// ---------------------------------------------------------------------------------------------- matchArtwork

test("matchArtwork: arquivo no tamanho com sangria (638 px para 54 mm a 300 dpi) → bleed", () => {
  assert.equal(matchArtwork({ w: 638, h: 638 }, SQUARE, SQUARE_PANEL), "bleed");
});

test("matchArtwork: arquivo no tamanho final a 300 dpi (591 px para 50 mm) → trim", () => {
  assert.equal(matchArtwork({ w: 591, h: 591 }, SQUARE, SQUARE_PANEL), "trim");
});

test("matchArtwork: mesma proporção sem resolução redonda fica com a sangria (na dúvida)", () => {
  // 1000 px em 50 mm = 508 dpi (longe de qualquer resolução comum) → não dá para afirmar que é sem sangria.
  assert.equal(matchArtwork({ w: 1000, h: 1000 }, SQUARE, SQUARE_PANEL), "bleed");
});

test("matchArtwork: folha inteira de um gabarito com dois painéis → sheet", () => {
  assert.equal(matchArtwork({ w: 5000, h: 3000 }, SHIRT, FRONT), "sheet");
  assert.equal(matchArtwork({ w: 5000, h: 3000 }, SHIRT, BACK), "sheet");
});

test("matchArtwork: painel da camisa na proporção da sangria e do corte", () => {
  // 440×560 (sangria) e 420×540 (corte) têm proporções diferentes o bastante para não se confundirem.
  assert.equal(matchArtwork({ w: 4400, h: 5600 }, SHIRT, FRONT), "bleed");
  assert.equal(matchArtwork({ w: 4200, h: 5400 }, SHIRT, FRONT), "trim");
});

test("matchArtwork: foto 16:9 num quadrado → other", () => {
  assert.equal(matchArtwork(PHOTO_16_9, SQUARE, SQUARE_PANEL), "other");
  assert.equal(matchArtwork(PHOTO_16_9, SHIRT, FRONT), "other");
  assert.equal(matchArtwork(PHOTO_16_9, A4, A4_PANEL), "other");
});

test("matchArtwork: A4 sem sangria recebe o A4 a 300 dpi como sangria (corte = folha)", () => {
  assert.equal(matchArtwork({ w: 2480, h: 3508 }, A4, A4_PANEL), "bleed");
  // A4 deitado não é o mesmo arquivo (o encaixe não gira a arte).
  assert.equal(matchArtwork({ w: 3508, h: 2480 }, A4, A4_PANEL), "other");
});

test("matchArtwork: medida física (página do PDF) decide antes da proporção", () => {
  // Quadrado: a folha é a própria sangria, então "sheet" não existe aqui.
  assert.equal(matchArtwork({ w: 1000, h: 1000 }, SQUARE, SQUARE_PANEL, { w: 54, h: 54 }), "bleed");
  // Sem a medida física, 1000×1000 seria "bleed"; com 50×50 mm é o tamanho final.
  assert.equal(matchArtwork({ w: 1000, h: 1000 }, SQUARE, SQUARE_PANEL, { w: 50, h: 50 }), "trim");
  // Camisa: folha, sangria e corte pela medida do PDF.
  assert.equal(matchArtwork({ w: 2000, h: 1200 }, SHIRT, FRONT, { w: 1000, h: 600 }), "sheet");
  assert.equal(matchArtwork({ w: 2000, h: 1200 }, SHIRT, FRONT, { w: 440, h: 560 }), "bleed");
  assert.equal(matchArtwork({ w: 2000, h: 1200 }, SHIRT, FRONT, { w: 420, h: 540 }), "trim");
  // A4 físico.
  assert.equal(matchArtwork({ w: 595, h: 842 }, A4, A4_PANEL, { w: 210, h: 297 }), "bleed");
});

test("matchArtwork: medida física nula, zerada ou fora de todas as caixas cai na proporção", () => {
  assert.equal(matchArtwork({ w: 591, h: 591 }, SQUARE, SQUARE_PANEL, null), "trim");
  assert.equal(matchArtwork({ w: 591, h: 591 }, SQUARE, SQUARE_PANEL, { w: 0, h: 0 }), "trim");
  assert.equal(matchArtwork(PHOTO_16_9, SQUARE, SQUARE_PANEL, { w: 160, h: 90 }), "other");
});

test("matchArtwork: tolerância física de 1,5 mm nas peças pequenas", () => {
  const px = { w: 1000, h: 1000 }; // pela proporção sozinha seria "bleed"
  assert.equal(matchArtwork(px, SQUARE, SQUARE_PANEL, { w: 51.5, h: 51.5 }), "trim");
  assert.equal(matchArtwork(px, SQUARE, SQUARE_PANEL, { w: 48.5, h: 50 }), "trim");
  assert.equal(matchArtwork(px, SQUARE, SQUARE_PANEL, { w: 55.5, h: 52.5 }), "bleed");
  // 52 mm: a 2 mm do corte e da sangria → nenhuma medida bate e vale a proporção (quadrada → sangria).
  assert.equal(matchArtwork({ w: 614, h: 614 }, SQUARE, SQUARE_PANEL, { w: 52, h: 52 }), "bleed");
  // 51,6 mm já passou da tolerância do corte.
  assert.equal(matchArtwork(px, SQUARE, SQUARE_PANEL, { w: 51.6, h: 51.6 }), "bleed");
});

test("matchArtwork: tolerância física de 1,5% nas peças grandes", () => {
  const px = PHOTO_16_9; // proporção que não bate com nada: só a medida física pode encaixar
  // Folha de 1000 mm: até 15 mm de diferença ainda é a folha.
  assert.equal(matchArtwork(px, SHIRT, FRONT, { w: 1015, h: 609 }), "sheet");
  assert.equal(matchArtwork(px, SHIRT, FRONT, { w: 1017, h: 600 }), "other");
  // Corte 420×540: 1,5% de 426 = 6,39 mm; de 548 = 8,22 mm.
  assert.equal(matchArtwork(px, SHIRT, FRONT, { w: 426, h: 548 }), "trim");
  assert.equal(matchArtwork(px, SHIRT, FRONT, { w: 427, h: 540 }), "other");
});

test("matchArtwork: tolerância de proporção de 1,2%", () => {
  assert.ok(aspectGap(1012 / 1000, 1) <= 0.012);
  assert.ok(aspectGap(1013 / 1000, 1) > 0.012);
  assert.equal(matchArtwork({ w: 1012, h: 1000 }, SQUARE, SQUARE_PANEL), "bleed");
  assert.equal(matchArtwork({ w: 1000, h: 1012 }, SQUARE, SQUARE_PANEL), "bleed");
  assert.equal(matchArtwork({ w: 1013, h: 1000 }, SQUARE, SQUARE_PANEL), "other");
  assert.equal(matchArtwork({ w: 1000, h: 1013 }, SQUARE, SQUARE_PANEL), "other");
});

test("aspectGap: simétrico, zero para proporções iguais e protegido contra zero", () => {
  assert.equal(aspectGap(1.5, 1.5), 0);
  near(aspectGap(2, 1), Math.log(2));
  near(aspectGap(1, 2), aspectGap(2, 1));
  assert.ok(Number.isFinite(aspectGap(0, 1)));
});

// ---------------------------------------------------------------------------------------------- placeArtwork e caixas

test("coverBox: 16:9 cobrindo a sangria do quadrado", () => {
  const rect = coverBox(PHOTO_16_9, SQUARE_PANEL.bleed);
  nearBox(rect, { x: -21, y: 0, w: 96, h: 54 });
});

test("coverBox: imagem em pé cobrindo uma caixa deitada fica centrada na vertical", () => {
  const rect = coverBox({ w: 1000, h: 2000 }, { x: 10, y: 20, w: 100, h: 50 });
  nearBox(rect, { x: 10, y: -55, w: 100, h: 200 });
});

test("containBox: 16:9 dentro da segurança do quadrado", () => {
  const rect = containBox(PHOTO_16_9, SQUARE_PANEL.safe!);
  nearBox(rect, { x: 6, y: 6 + (42 - 23.625) / 2, w: 42, h: 23.625 });
});

test("containBox e coverBox: mesma proporção → a própria caixa", () => {
  const box = { x: 3, y: 4, w: 30, h: 60 };
  nearBox(containBox({ w: 300, h: 600 }, box), box);
  nearBox(coverBox({ w: 300, h: 600 }, box), box);
});

test("placeArtwork auto: cada encaixe vai para a sua caixa", () => {
  const sq = { w: 638, h: 638 };
  assert.deepEqual(placeArtwork("auto", "bleed", sq, SQUARE, SQUARE_PANEL), { x: 0, y: 0, w: 54, h: 54 });
  assert.deepEqual(placeArtwork("auto", "trim", sq, SQUARE, SQUARE_PANEL), { x: 2, y: 2, w: 50, h: 50 });
  assert.deepEqual(placeArtwork("auto", "sheet", { w: 5000, h: 3000 }, SHIRT, BACK), { x: 0, y: 0, w: 1000, h: 600 });
  nearBox(placeArtwork("auto", "other", PHOTO_16_9, SQUARE, SQUARE_PANEL), { x: -21, y: 0, w: 96, h: 54 });
});

test("placeArtwork auto: devolve cópia (não a caixa do gabarito)", () => {
  const rect = placeArtwork("auto", "bleed", { w: 638, h: 638 }, SQUARE, SQUARE_PANEL);
  assert.notEqual(rect, SQUARE_PANEL.bleed);
  // O corte devolvido não carrega a forma.
  const trim = placeArtwork("auto", "trim", { w: 4200, h: 5400 }, SHIRT, FRONT);
  assert.deepEqual(Object.keys(trim).sort(), ["h", "w", "x", "y"]);
});

test("placeArtwork cover: sempre cobre a sangria, qualquer que seja o encaixe", () => {
  for (const match of ["sheet", "bleed", "trim", "other"] as const) {
    nearBox(placeArtwork("cover", match, PHOTO_16_9, SQUARE, SQUARE_PANEL), { x: -21, y: 0, w: 96, h: 54 });
  }
  // Quadrada sobre a sangria 440×560 da frente: a altura manda e sobra 60 mm de cada lado.
  nearBox(placeArtwork("cover", "other", { w: 1000, h: 1000 }, SHIRT, FRONT), { x: -40, y: 20, w: 560, h: 560 });
});

test("placeArtwork contain: cabe inteira na segurança; sem segurança, no corte", () => {
  nearBox(placeArtwork("contain", "other", PHOTO_16_9, SQUARE, SQUARE_PANEL), { x: 6, y: 15.1875, w: 42, h: 23.625 });
  const noSafe: TemplatePanel = { ...SQUARE_PANEL, safe: null };
  nearBox(placeArtwork("contain", "other", PHOTO_16_9, SQUARE, noSafe), { x: 2, y: 2 + (50 - 28.125) / 2, w: 50, h: 28.125 });
});

test("leavesBleedUncovered: tamanho final e caber deixam borda; sangria e cobrir não", () => {
  const bleed = SQUARE_PANEL.bleed;
  assert.equal(leavesBleedUncovered({ x: 2, y: 2, w: 50, h: 50 }, bleed), true);
  assert.equal(leavesBleedUncovered({ ...bleed }, bleed), false);
  assert.equal(leavesBleedUncovered(coverBox(PHOTO_16_9, bleed), bleed), false);
  assert.equal(leavesBleedUncovered(containBox(PHOTO_16_9, SQUARE_PANEL.safe!), bleed), true);
  // Folga de 0,05 mm para arredondamentos.
  assert.equal(leavesBleedUncovered({ x: 0.04, y: 0, w: 54, h: 54 }, bleed), false);
  assert.equal(leavesBleedUncovered({ x: 0.06, y: 0, w: 54, h: 54 }, bleed), true);
  assert.equal(leavesBleedUncovered({ x: 0, y: 0, w: 53.96, h: 54 }, bleed), false);
  assert.equal(leavesBleedUncovered({ x: 0, y: 0, w: 54, h: 53.9 }, bleed), true);
});

test("croppedShare: 16:9 cobrindo um quadrado perde 43,75%", () => {
  const bleed = SQUARE_PANEL.bleed;
  near(croppedShare(coverBox(PHOTO_16_9, bleed), bleed), 0.4375);
  assert.equal(croppedShare({ ...bleed }, bleed), 0);
  assert.equal(croppedShare(containBox(PHOTO_16_9, SQUARE_PANEL.safe!), bleed), 0);
  // Totalmente fora → tudo descartado; caixa vazia → nada.
  assert.equal(croppedShare({ x: 100, y: 100, w: 10, h: 10 }, bleed), 1);
  assert.equal(croppedShare({ x: 0, y: 0, w: 0, h: 10 }, bleed), 0);
});

test("dpiAt: resolução efetiva na caixa (menor dos dois eixos)", () => {
  near(dpiAt({ w: 638, h: 638 }, SQUARE_PANEL.bleed), 638 / (54 / 25.4));
  assert.equal(Math.round(dpiAt({ w: 638, h: 638 }, SQUARE_PANEL.bleed)), 300);
  near(dpiAt({ w: 1000, h: 500 }, { x: 0, y: 0, w: 25.4, h: 25.4 }), 500);
  near(dpiAt(PHOTO_16_9, coverBox(PHOTO_16_9, SQUARE_PANEL.bleed)), 1080 / (54 / 25.4));
  assert.equal(dpiAt({ w: 1000, h: 1000 }, { x: 0, y: 0, w: 0, h: 10 }), 0);
});

test("pixelsFor: pixels para imprimir a caixa na resolução", () => {
  assert.deepEqual(pixelsFor({ w: 54, h: 54 }, 300), { w: 638, h: 638 });
  assert.deepEqual(pixelsFor({ w: 50, h: 50 }, 300), { w: 591, h: 591 });
  assert.deepEqual(pixelsFor({ w: 210, h: 297 }, 300), { w: 2480, h: 3508 });
  assert.deepEqual(pixelsFor({ w: 0.01, h: 0 }, 72), { w: 1, h: 1 });
});

// ---------------------------------------------------------------------------------------------- editor 2D

test("placementFromBox: caixa de corte com a proporção do corte → centro, escala 1", () => {
  assert.deepEqual(placementFromBox({ x: 2, y: 2, w: 50, h: 50 }, SQUARE_PANEL.cut, 1), { x: 0.5, y: 0.5, scale: 1, rotation: 0 });
  const p = placementFromBox(SQUARE_PANEL.bleed, SQUARE_PANEL.cut, 1);
  near(p.x, 0.5);
  near(p.y, 0.5);
  near(p.scale, 54 / 50);
  assert.equal(p.rotation, 0);
});

test("placementFromBox: 16:9 cobrindo o quadrado → escala 1,92 (largura sobre o corte)", () => {
  const p = placementFromBox(coverBox(PHOTO_16_9, SQUARE_PANEL.bleed), SQUARE_PANEL.cut, 16 / 9);
  near(p.x, 0.5);
  near(p.y, 0.5);
  near(p.scale, 96 / 50);
});

test("placementFromBox ↔ boxFromPlacement: ida e volta em várias proporções", () => {
  const cuts: Box[] = [SQUARE_PANEL.cut, FRONT.cut, BACK.cut, A4_PANEL.cut, { x: -5, y: 7, w: 300, h: 40 }];
  const rects: Box[] = [
    { x: 0, y: 0, w: 54, h: 54 },
    { x: -21, y: 0, w: 96, h: 54 },
    { x: 10, y: 15, w: 30, h: 90 },
    { x: 100, y: -40, w: 800, h: 20 },
    { x: 33.3, y: 12.7, w: 0.5, h: 0.7 },
    { x: 0, y: 0, w: 1000, h: 600 },
  ];
  for (const cut of cuts) {
    for (const rect of rects) {
      const aspect = rect.w / rect.h;
      const back = boxFromPlacement(placementFromBox(rect, cut, aspect), cut, aspect);
      nearBox(back, rect, 1e-9);
    }
  }
});

test("boxFromPlacement: escala 1 = imagem inteira contida no corte, centrada", () => {
  nearBox(boxFromPlacement({ x: 0.5, y: 0.5, scale: 1 }, SQUARE_PANEL.cut, 16 / 9), { x: 2, y: 2 + (50 - 28.125) / 2, w: 50, h: 28.125 });
  nearBox(boxFromPlacement({ x: 0.5, y: 0.5, scale: 1 }, A4_PANEL.cut, 1), { x: 0, y: (297 - 210) / 2, w: 210, h: 210 });
  // Posição em frações do corte: x = 0 põe o centro da imagem na borda esquerda do corte.
  nearBox(boxFromPlacement({ x: 0, y: 1, scale: 0.5 }, SQUARE_PANEL.cut, 1), { x: 2 - 12.5, y: 52 - 12.5, w: 25, h: 25 });
});

test("bleedFractions: sangria em frações do corte", () => {
  const sq = bleedFractions(SQUARE_PANEL);
  for (const v of Object.values(sq)) near(v, 2 / 50);
  const front = bleedFractions(FRONT);
  near(front.left, 10 / 420);
  near(front.right, 10 / 420);
  near(front.top, 10 / 540);
  near(front.bottom, 10 / 540);
  assert.deepEqual(bleedFractions(A4_PANEL), { left: 0, top: 0, right: 0, bottom: 0 });
  // Sangria diferente em cada lado.
  const uneven: TemplatePanel = { ...SQUARE_PANEL, bleed: { x: 0, y: 0, w: 60, h: 55 }, cut: { x: 3, y: 2, w: 50, h: 50, shape: "rect" } };
  const f = bleedFractions(uneven);
  near(f.left, 0.06);
  near(f.top, 0.04);
  near(f.right, 0.14);
  near(f.bottom, 0.06);
  // Sangria "por dentro" do corte (dado torto) não vira fração negativa.
  const inside: TemplatePanel = { ...SQUARE_PANEL, bleed: { x: 3, y: 3, w: 48, h: 48 } };
  assert.deepEqual(bleedFractions(inside), { left: 0, top: 0, right: 0, bottom: 0 });
});

// ---------------------------------------------------------------------------------------------- autoPlacement

test("autoPlacement: arquivo com sangria → caixa da sangria", () => {
  const { match, rect, placement } = autoPlacement({ w: 638, h: 638 }, null, SQUARE, SQUARE_PANEL);
  assert.equal(match, "bleed");
  assert.deepEqual(rect, SQUARE_PANEL.bleed);
  near(placement.scale, 1.08);
  nearBox(boxFromPlacement(placement, SQUARE_PANEL.cut, 1), SQUARE_PANEL.bleed);
});

test("autoPlacement: arquivo no tamanho final → caixa de corte (escala 1)", () => {
  const { match, placement } = autoPlacement({ w: 591, h: 591 }, undefined, SQUARE, SQUARE_PANEL);
  assert.equal(match, "trim");
  assert.deepEqual(placement, { x: 0.5, y: 0.5, scale: 1, rotation: 0 });
  // PDF de 50×50 mm em qualquer resolução também.
  const pdf = autoPlacement({ w: 1000, h: 1000 }, { w: 50, h: 50 }, SQUARE, SQUARE_PANEL);
  assert.equal(pdf.match, "trim");
  nearBox(boxFromPlacement(pdf.placement, SQUARE_PANEL.cut, 1), { x: 2, y: 2, w: 50, h: 50 });
});

test("autoPlacement: folha inteira da camisa entra 1:1 nos dois painéis", () => {
  const px = { w: 5000, h: 3000 };
  const sheet = { x: 0, y: 0, w: 1000, h: 600 };
  for (const panel of [FRONT, BACK]) {
    const { match, rect, placement } = autoPlacement(px, null, SHIRT, panel);
    assert.equal(match, "sheet");
    assert.deepEqual(rect, sheet);
    nearBox(boxFromPlacement(placement, panel.cut, px.w / px.h), sheet, 1e-9);
  }
  // No verso, o centro da folha fica à esquerda do corte das costas.
  const back = autoPlacement(px, null, SHIRT, BACK).placement;
  near(back.x, (500 - 550) / 420);
  near(back.y, 0.5);
});

test("autoPlacement: foto 16:9 cobre a sangria (auto/cover) ou cabe na segurança (contain)", () => {
  const auto = autoPlacement(PHOTO_16_9, null, SQUARE, SQUARE_PANEL);
  assert.equal(auto.match, "other");
  nearBox(auto.rect, { x: -21, y: 0, w: 96, h: 54 });
  nearBox(boxFromPlacement(auto.placement, SQUARE_PANEL.cut, 16 / 9), { x: -21, y: 0, w: 96, h: 54 }, 1e-9);

  const cover = autoPlacement(PHOTO_16_9, null, SQUARE, SQUARE_PANEL, "cover");
  nearBox(cover.rect, auto.rect);

  const contain = autoPlacement(PHOTO_16_9, null, SQUARE, SQUARE_PANEL, "contain");
  assert.equal(contain.match, "other");
  const expected = { x: 6, y: 15.1875, w: 42, h: 23.625 };
  nearBox(contain.rect, expected);
  nearBox(boxFromPlacement(contain.placement, SQUARE_PANEL.cut, 16 / 9), expected, 1e-9);
  near(contain.placement.scale, 42 / 50);
});

test("autoPlacement: modo contain mesmo com arquivo no tamanho certo", () => {
  const { match, rect } = autoPlacement({ w: 638, h: 638 }, null, SQUARE, SQUARE_PANEL, "contain");
  assert.equal(match, "bleed");
  nearBox(rect, { x: 6, y: 6, w: 42, h: 42 });
});

// ---------------------------------------------------------------------------------------------- folhas e painéis

const page = (id: string, extra: Partial<TemplatePage> = {}): TemplatePage => ({ ...SQUARE, id, label: id, ...extra });

const BY_OPTION: ProductTemplate = {
  key: "cartao",
  url: "https://exemplo.invalid/gabarito.zip",
  pages: [page("a4"), page("a5"), page("a6"), page("a4-verso")],
  byOption: {
    Tamanho: { "21,0x29,7 cm": ["a4", "a4-verso"], "14,8x21,0 cm": ["a5"], "10,5x14,8 cm": ["a6"], Vazio: [] },
    Lados: { "Frente e verso": ["a4", "a4-verso", "a5", "a6"], "Só frente": ["a4", "a5", "a6"] },
  },
};

test("pagesFor: sem seleção ou opção sem mapa → todas as folhas; valor sem folha → sem gabarito", () => {
  assert.deepEqual(pagesFor(BY_OPTION, {}).map((p) => p.id), ["a4", "a5", "a6", "a4-verso"]);
  assert.deepEqual(pagesFor(BY_OPTION, { Acabamento: "Verniz" }).map((p) => p.id), ["a4", "a5", "a6", "a4-verso"]);
  // Medida que o arquivo do gabarito não traz: nenhuma folha (não usar a folha de outra medida).
  assert.deepEqual(pagesFor(BY_OPTION, { Tamanho: "1x1 m" }).map((p) => p.id), []);
});

test("pagesFor: byOption filtra e cruza várias opções (na ordem do gabarito)", () => {
  assert.deepEqual(pagesFor(BY_OPTION, { Tamanho: "21,0x29,7 cm" }).map((p) => p.id), ["a4", "a4-verso"]);
  assert.deepEqual(pagesFor(BY_OPTION, { Tamanho: "21,0x29,7 cm", Lados: "Só frente" }).map((p) => p.id), ["a4"]);
  assert.deepEqual(pagesFor(BY_OPTION, { Lados: "Só frente" }).map((p) => p.id), ["a4", "a5", "a6"]);
});

test("pagesFor: cruzamento vazio ou valor mapeado para nenhuma folha → sem gabarito", () => {
  const tpl: ProductTemplate = { ...BY_OPTION, byOption: { A: { x: ["a4"] }, B: { y: ["a5"] } } };
  assert.deepEqual(pagesFor(tpl, { A: "x", B: "y" }).map((p) => p.id), []);
  assert.deepEqual(pagesFor(BY_OPTION, { Tamanho: "Vazio" }).map((p) => p.id), []);
});

const BY_SIZE: ProductTemplate = {
  key: "camisa",
  url: "https://exemplo.invalid/camisa.zip",
  pages: [page("p", { size: "P" }), page("m", { size: "M" }), page("6a", { size: "6 Anos" }), page("m-gola-v", { size: "M" })],
  byOption: { Gola: { "Gola V": ["m-gola-v"], Redonda: ["p", "m", "6a"] } },
  bySize: { P: ["p"], M: ["m", "m-gola-v"], "6 Anos": ["6a"] },
};

test("pagesFor: bySize pelo tamanho exato e pelo normalizado", () => {
  assert.deepEqual(pagesFor(BY_SIZE, {}, "P").map((p) => p.id), ["p"]);
  assert.deepEqual(pagesFor(BY_SIZE, {}, "Tam: P").map((p) => p.id), ["p"]);
  assert.deepEqual(pagesFor(BY_SIZE, {}, "Tamanho: P (30-34)").map((p) => p.id), ["p"]);
  assert.deepEqual(pagesFor(BY_SIZE, {}, "6 anos").map((p) => p.id), ["6a"]);
  assert.deepEqual(pagesFor(BY_SIZE, {}, "M").map((p) => p.id), ["m", "m-gola-v"]);
});

test("pagesFor: bySize cruza com byOption; tamanho ausente ou desconhecido não filtra", () => {
  assert.deepEqual(pagesFor(BY_SIZE, { Gola: "Redonda" }, "M").map((p) => p.id), ["m"]);
  assert.deepEqual(pagesFor(BY_SIZE, { Gola: "Gola V" }, "Tam: M").map((p) => p.id), ["m-gola-v"]);
  assert.deepEqual(pagesFor(BY_SIZE, { Gola: "Redonda" }, null).map((p) => p.id), ["p", "m", "6a"]);
  assert.deepEqual(pagesFor(BY_SIZE, {}, "XGG").map((p) => p.id), ["p", "m", "6a", "m-gola-v"]);
  // Gola V só existe no M: no P o cruzamento é vazio — sem gabarito (não usar a folha de outra gola).
  assert.deepEqual(pagesFor(BY_SIZE, { Gola: "Gola V" }, "P").map((p) => p.id), []);
});

test("normalizeSize: tira o prefixo e a faixa, padroniza 'Anos'", () => {
  assert.equal(normalizeSize("Tam: P"), "P");
  assert.equal(normalizeSize("tam P"), "P");
  assert.equal(normalizeSize("Tamanho: GG"), "GG");
  assert.equal(normalizeSize("TAMANHO:M"), "M");
  assert.equal(normalizeSize("P (30-34)"), "P");
  assert.equal(normalizeSize("6 anos"), "6 Anos");
  assert.equal(normalizeSize("Tam: 10 ANOS"), "10 Anos");
  assert.equal(normalizeSize("1 ano"), "1 Ano");
  assert.equal(normalizeSize("  G  "), "G");
});

test("sideOf: lado do painel, depois o da folha, depois frente no primeiro", () => {
  assert.equal(sideOf(SHIRT, BACK, 0), "back");
  assert.equal(sideOf(SQUARE, SQUARE_PANEL, 0), "front");
  assert.equal(sideOf(SQUARE, SQUARE_PANEL, 1), "other");
  const backPage: TemplatePage = { ...SQUARE, side: "back" };
  assert.equal(sideOf(backPage, SQUARE_PANEL, 0), "back");
  assert.equal(sideOf(backPage, { ...SQUARE_PANEL, side: "front" }, 0), "front");
});

test("panelFor e hasBackPanel: camisa com frente e costas na mesma folha", () => {
  const front = panelFor([SHIRT], "front");
  const back = panelFor([SHIRT], "back");
  assert.equal(front?.index, 0);
  assert.equal(front?.panel, FRONT);
  assert.equal(back?.index, 1);
  assert.equal(back?.panel, BACK);
  assert.equal(back?.page, SHIRT);
  assert.equal(hasBackPanel([SHIRT]), true);
});

test("panelFor e hasBackPanel: frente e verso em folhas separadas", () => {
  const frontPage: TemplatePage = { ...SQUARE, id: "frente", side: "front" };
  const backPage: TemplatePage = { ...SQUARE, id: "verso", side: "back" };
  assert.equal(panelFor([frontPage, backPage], "back")?.page.id, "verso");
  assert.equal(panelFor([frontPage, backPage], "front")?.page.id, "frente");
  // A ordem das folhas não importa para achar o verso.
  assert.equal(panelFor([backPage, frontPage], "front")?.page.id, "frente");
  assert.equal(hasBackPanel([frontPage, backPage]), true);
});

test("panelFor: sem verso → null; frente cai no primeiro painel", () => {
  assert.equal(panelFor([SQUARE], "back"), null);
  assert.equal(hasBackPanel([SQUARE, A4]), false);
  assert.equal(panelFor([SQUARE], "front")?.panel, SQUARE_PANEL);
  // Só o verso cadastrado: a frente usa o primeiro painel mesmo assim.
  const backOnly: TemplatePage = { ...A4, side: "back" };
  assert.equal(panelFor([backOnly], "front")?.panel, A4_PANEL);
  assert.equal(panelFor([], "front"), null);
  assert.equal(hasBackPanel([]), false);
});

test("parametricPage: medida digitada com a regra de sangria e segurança", () => {
  const p = parametricPage({ bleedMm: 3, safeMm: 5 }, 10, 15);
  assert.ok(p);
  assert.equal(p.id, "medida-100x150");
  assert.equal(p.label, "Medida 10 cm × 15 cm");
  assert.equal(p.manual, true);
  assert.deepEqual(p.sheet, { w: 106, h: 156 });
  assert.equal(p.panels.length, 1);
  const [panel] = p.panels;
  assert.deepEqual(panel.bleed, { x: 0, y: 0, w: 106, h: 156 });
  assert.deepEqual(panel.cut, { x: 3, y: 3, w: 100, h: 150, shape: "rect" });
  assert.deepEqual(panel.safe, { x: 8, y: 8, w: 90, h: 140, shape: "rect" });
  assert.equal(panel.implicitBleed, undefined);
  assert.deepEqual(panel.metrics, { finalMm: { w: 100, h: 150 }, bleedMm: uniform(3), safeMm: uniform(5) });
  // A folha gerada funciona no encaixe: o arquivo com sangria a 300 dpi é reconhecido.
  const px = pixelsFor({ w: 106, h: 156 }, 300);
  assert.equal(matchArtwork(px, p, panel), "bleed");
});

test("parametricPage: sem sangria, sem segurança e medidas quebradas", () => {
  const noBleed = parametricPage({ bleedMm: 0, safeMm: 0 }, 21, 29.7);
  assert.ok(noBleed);
  assert.equal(noBleed.panels[0].implicitBleed, true);
  assert.equal(noBleed.panels[0].safe, null);
  assert.equal(noBleed.panels[0].metrics.safeMm, null);
  assert.deepEqual(noBleed.sheet, { w: 210, h: 297 });
  assert.equal(noBleed.label, "Medida 21 cm × 29,7 cm");
  // Segurança maior que metade da peça → sem área de segurança.
  const tiny = parametricPage({ bleedMm: 2, safeMm: 5 }, 1, 3);
  assert.equal(tiny?.panels[0].safe, null);
  // Arredonda para 0,1 mm.
  const odd = parametricPage({ bleedMm: 2, safeMm: 3 }, 10.55, 1.234);
  assert.deepEqual(odd?.panels[0].metrics.finalMm, { w: 105.5, h: 12.3 });
});

test("parametricPage: medida zerada, negativa ou inválida → null", () => {
  const rule = { bleedMm: 3, safeMm: 5 };
  assert.equal(parametricPage(rule, 0, 10), null);
  assert.equal(parametricPage(rule, 10, 0), null);
  assert.equal(parametricPage(rule, -5, 10), null);
  assert.equal(parametricPage(rule, 10, -1), null);
  assert.equal(parametricPage(rule, Number.NaN, 10), null);
});

// ---------------------------------------------------------------------------------------------- texto

test("formatMm: mm, cm e m em pt-BR", () => {
  assert.equal(formatMm(2), "2 mm");
  assert.equal(formatMm(2.5), "2,5 mm");
  assert.equal(formatMm(10), "1 cm");
  assert.equal(formatMm(90), "9 cm");
  assert.equal(formatMm(297), "29,7 cm");
  assert.equal(formatMm(297.4), "29,7 cm");
  assert.equal(formatMm(1000), "1 m");
  assert.equal(formatMm(1200), "1,2 m");
  assert.equal(formatMm(1234), "1,23 m");
});

test("formatSides: margem uniforme, quase uniforme ou 'a partir de'", () => {
  assert.equal(formatSides(uniform(2)), "2 mm");
  assert.equal(formatSides(uniform(30)), "3 cm");
  assert.equal(formatSides({ top: 3, right: 3.4, bottom: 3, left: 3.4 }), "3,2 mm");
  assert.equal(formatSides({ top: 2, right: 3, bottom: 2, left: 3 }), "a partir de 2 mm");
  assert.equal(formatSides({ top: 15, right: 10, bottom: 12, left: 10 }), "a partir de 1 cm");
  assert.equal(formatSides({ top: 0, right: 3, bottom: 0, left: 3 }), "até 3 mm, só em alguns lados");
  assert.equal(formatSides(uniform(0)), null);
  assert.equal(formatSides(null), null);
});

test("describePanel: resumo do quadrado, da camisa e do A4", () => {
  assert.deepEqual(describePanel(SQUARE_PANEL), { final: "5 cm × 5 cm", bleed: "2 mm", safe: "4 mm", shape: null });
  assert.deepEqual(describePanel(FRONT), { final: "42 cm × 54 cm", bleed: "1 cm", safe: "3 cm", shape: "corte especial" });
  // A4 sem sangria: a sangria não aparece.
  assert.deepEqual(describePanel(A4_PANEL), { final: "21 cm × 29,7 cm", bleed: null, safe: "5 mm", shape: null });
});

test("describePanel: formas de corte e painel sem segurança", () => {
  const round: TemplatePanel = { ...SQUARE_PANEL, cut: { ...SQUARE_PANEL.cut, shape: "ellipse" } };
  assert.equal(describePanel(round).shape, "corte redondo");
  const oval: TemplatePanel = {
    ...SQUARE_PANEL,
    cut: { x: 2, y: 2, w: 50, h: 30, shape: "ellipse" },
    metrics: { ...SQUARE_PANEL.metrics, finalMm: { w: 50, h: 30 } },
  };
  assert.equal(describePanel(oval).shape, "corte oval");
  assert.equal(describePanel(oval).final, "5 cm × 3 cm");
  const rounded: TemplatePanel = { ...SQUARE_PANEL, cut: { ...SQUARE_PANEL.cut, shape: "rounded" } };
  assert.equal(describePanel(rounded).shape, "cantos arredondados");
  const noSafe: TemplatePanel = { ...SQUARE_PANEL, safe: null, metrics: { ...SQUARE_PANEL.metrics, safeMm: null } };
  assert.equal(describePanel(noSafe).safe, null);
  const uneven: TemplatePanel = { ...SQUARE_PANEL, metrics: { ...SQUARE_PANEL.metrics, bleedMm: { top: 2, right: 5, bottom: 2, left: 5 } } };
  assert.equal(describePanel(uneven).bleed, "a partir de 2 mm");
});

test("printsBack: só a opção de cor/impressão decide; verniz 'UV Total 1/0' não tira o verso", () => {
  assert.equal(printsBack({ Cor: "4/4 (colorido frente e verso)", Acabamento: "UV Total 1/0" }), true);
  assert.equal(printsBack({ Cor: "4/0 (colorido só frente)", Acabamento: "UV Total 1/0" }), false);
  assert.equal(printsBack({ "03 - Cor": "4/1 (frente colorido e verso em tons de cinza)" }), true);
  assert.equal(printsBack({ Acabamento: "UV Total 1/0 e Canteamento", Cor: "4/4" }), true);
  assert.equal(printsBack({ Impressão: "Só frente" }), false);
  assert.equal(printsBack({}), true);
});

// ---------------------------------------------------------------------------------------------- peças, giros e faces

/** Folheto deitado 150×100 (sangria 2 mm) visto em pé no editor: o arquivo feito no gabarito baixado (deitado) entra girado. */
const LANDSCAPE_PANEL: TemplatePanel = {
  bleed: { x: 0, y: 0, w: 154, h: 104 },
  cut: { x: 2, y: 2, w: 150, h: 100, shape: "rect" },
  safe: { x: 6, y: 6, w: 142, h: 92, shape: "rect" },
  metrics: { finalMm: { w: 150, h: 100 }, bleedMm: uniform(2), safeMm: uniform(4) },
};
const LANDSCAPE: TemplatePage = { id: "folheto", label: "Folheto", sheet: { w: 154, h: 104 }, panels: [LANDSCAPE_PANEL] };

/** Almofada num tecido só: verso em cima (de cabeça para baixo), frente embaixo, dobra em y = 210. */
const PILLOW_PANEL: TemplatePanel = {
  bleed: { x: 0, y: 0, w: 240, h: 440 },
  cut: { x: 10, y: 10, w: 220, h: 420, shape: "rect" },
  safe: { x: 30, y: 30, w: 180, h: 380, shape: "rect", parts: [{ x: 30, y: 30, w: 180, h: 170 }, { x: 30, y: 240, w: 180, h: 170 }] },
  metrics: { finalMm: { w: 220, h: 420 }, bleedMm: uniform(10), safeMm: uniform(20) },
  faces: [
    { box: { x: 10, y: 10, w: 220, h: 210 }, safe: { x: 30, y: 30, w: 180, h: 170 }, name: "Verso", side: "back", rotate: 180 },
    { box: { x: 10, y: 220, w: 220, h: 210 }, safe: { x: 30, y: 240, w: 180, h: 170 }, name: "Frente", side: "front" },
  ],
};
const PILLOW: TemplatePage = { id: "almofada", label: "Almofada", sheet: { w: 240, h: 440 }, panels: [PILLOW_PANEL] };

test("faces: cada face é uma peça de pé, com sangria só nas bordas externas (na dobra, não)", () => {
  const pieces = piecesOf(PILLOW);
  assert.equal(pieces.length, 2);
  const front = pieces.find((p) => p.side === "front");
  const back = pieces.find((p) => p.side === "back");
  assert.ok(front && back);
  // Frente: sangria em cima? Não (dobra); embaixo e nas laterais, sim.
  assert.deepEqual(front.panel.metrics.bleedMm, { top: 0, right: 10, bottom: 10, left: 10 });
  // Verso girado 180°: a dobra (embaixo na folha) fica em cima quando ele está de pé.
  assert.equal(back.rotate, 180);
  assert.deepEqual(back.panel.metrics.bleedMm, { top: 0, right: 10, bottom: 10, left: 10 });
  assert.equal(panelFor([PILLOW], "front")?.piece.faceIndex, 1);
  assert.equal(hasBackPanel([PILLOW]), true);
});

test("folha girada: arquivo no tamanho com sangria do gabarito original entra girado 90° e cobre a sangria", () => {
  const [view] = orientPages([LANDSCAPE], 100 / 150);
  assert.equal(view.rotated, true);
  const piece = panelFor([view], "front")!.piece;
  // PDF 154×104 mm (a folha baixada, deitada).
  const fit = autoPlacementFor(piece, { w: 1819, h: 1228 }, { w: 154, h: 104 });
  // Folha de uma peça só (folha = sangria): conta como "com sangria".
  assert.equal(fit.match, "bleed");
  assert.equal(Math.abs(fit.placement.rotation), 90);
  // A imagem (sem giro) fica centrada na sangria da peça em pé, com os lados trocados.
  const box = boxFromPlacement(fit.placement, piece.panel.cut, 1819 / 1228);
  assert.ok(Math.abs(box.x + box.w / 2 - (piece.panel.bleed.x + piece.panel.bleed.w / 2)) < 0.5);
  assert.ok(Math.abs(box.w - 154) < 0.6 && Math.abs(box.h - 104) < 0.6);
});

test("folha inteira do gabarito numa face: entra 1:1 com o giro da face", () => {
  const back = piecesOf(PILLOW).find((p) => p.side === "back")!;
  const fit = autoPlacementFor(back, { w: 2835, h: 5197 }, { w: 240, h: 440 });
  assert.equal(fit.match, "sheet");
  assert.equal(Math.abs(fit.placement.rotation), 180);
  const front = piecesOf(PILLOW).find((p) => p.side === "front")!;
  const f = autoPlacementFor(front, { w: 2835, h: 5197 }, { w: 240, h: 440 });
  assert.equal(f.match, "sheet");
  assert.equal(f.placement.rotation, 0);
  // A folha cobre a frente na posição dela: o topo da folha fica 220 mm acima do topo da peça da frente.
  const box = boxFromPlacement(f.placement, front.panel.cut, 240 / 440);
  assert.ok(Math.abs(box.y - (0 - front.at.y)) < 0.6);
});

test("orientPages não gira folhas cuja peça da frente é uma face (a face já fica de pé pela curadoria)", () => {
  assert.deepEqual(orientPages([PILLOW], 2.5), [PILLOW]);
});

test("encaixe reconhecido cobre a caixa inteira: arquivo 1,2% mais largo não deixa filete em cima/embaixo", () => {
  const panel = SQUARE_PANEL;
  const p = placementFromVisual({ x: 0, y: 0, w: 54, h: 54 }, panel.cut, 1.012, 0, true);
  const box = boxFromPlacement(p, panel.cut, 1.012);
  assert.ok(box.h >= 54 - 1e-6 && box.w >= 54 - 1e-6);
});

test("pieceKey muda quando a seleção troca de folha, de painel ou de face", () => {
  const a = piecesOf(PILLOW);
  assert.notEqual(pieceKey(a[0]), pieceKey(a[1]));
  assert.notEqual(pieceKey(piecesOf(SQUARE)[0]), pieceKey(piecesOf({ ...SQUARE, id: "outra" })[0]));
});

test("plausibilidade: SVG (vetor) feito no gabarito de peça grande entra 1:1; bitmap pequeno na mesma proporção, não", () => {
  const panel: TemplatePanel = {
    bleed: { x: 0, y: 0, w: 1220, h: 2420 },
    cut: { x: 10, y: 10, w: 1200, h: 2400, shape: "rect" },
    safe: { x: 40, y: 40, w: 1140, h: 2340, shape: "rect" },
    metrics: { finalMm: { w: 1200, h: 2400 }, bleedMm: uniform(10), safeMm: uniform(30) },
  };
  const page: TemplatePage = { id: "lona", label: "Lona 120 × 240", sheet: { w: 1220, h: 2420 }, panels: [panel] };
  const piece = piecesOf(page)[0];
  // Prévia do SVG rasterizada em 2048 px (21 dpi nessa medida): vetor conta como arte final.
  assert.equal(autoPlacementFor(piece, { w: 1032, h: 2048 }, null, "auto", true).match, "bleed");
  assert.equal(autoPlacementFor(piece, { w: 1032, h: 2048 }, null).match, "other");
});

test("plausibilidade: sangria e tamanho final se medem pela peça, não pela folha inteira", () => {
  // Folha de 1000 mm com frente e costas (sangria 440 × 560): 900 px seriam 23 dpi na folha, 41 dpi na peça.
  const front = panelFor([SHIRT], "front")!.piece;
  assert.equal(autoPlacementFor(front, { w: 707, h: 900 }, null).match, "other", "41 dpi numa peça de 56 cm não é arte final");
  assert.notEqual(autoPlacementFor(front, { w: 1650, h: 2100 }, null).match, "other", "76 dpi: arte final da peça");
});
