import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DPI_MIN,
  DPI_RECOMMENDED,
  FACADE_PRESETS,
  MAX_FILE_MB,
  MB,
  affineFromTriangles,
  applyAffine,
  applyHomography,
  boxBlur,
  buildFacadeMaterials,
  defaultQuad,
  facadeCartOptions,
  facadeLabel,
  facadeQuote,
  facadeSize,
  fitRect,
  formatMeasureInput,
  formatPixels,
  homography,
  inflateTriangle,
  invert3,
  isConvexQuad,
  isMirrored,
  measureError,
  meshDivisions,
  moveQuad,
  multiply3,
  parseMeasure,
  percentile,
  perspectiveMesh,
  photoFileError,
  pointInQuad,
  printSize,
  quadCenter,
  quadToSquare,
  ratioLabel,
  requiredPixels,
  setCorner,
  shadeFactor,
  signedArea,
  squareToQuad,
  textureSide,
} from "./facade.ts";
import type { FacadeSource, Mat3, Point, Quad, Tri } from "./facade.ts";
import { areaQuote, cleanOptionLabel, optionKeys, plainAreaRules, quote } from "./pricing.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { products: FacadeSource[] };

const near = (actual: number, expected: number, tolerance = 1e-6, label = "") =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} esperado ${expected}, veio ${actual}`);
const nearPoint = (actual: Point, expected: Point, tolerance = 1e-6, label = "") => {
  near(actual.x, expected.x, tolerance, `${label} x`);
  near(actual.y, expected.y, tolerance, `${label} y`);
};

const UNIT: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
// Fachada vista de lado: o lado esquerdo mais alto (perto) e o direito mais baixo (longe).
const TRAPEZOID: Quad = [
  { x: 120, y: 80 },
  { x: 900, y: 210 },
  { x: 880, y: 470 },
  { x: 140, y: 560 },
];

/** Cruzamento das diagonais p0–p2 e p1–p3. */
function diagonalCross(q: Quad): Point {
  const [a, b, c, d] = q;
  const den = (a.x - c.x) * (b.y - d.y) - (a.y - c.y) * (b.x - d.x);
  const t = ((a.x - b.x) * (b.y - d.y) - (a.y - b.y) * (b.x - d.x)) / den;
  return { x: a.x + t * (c.x - a.x), y: a.y + t * (c.y - a.y) };
}

// ------------------------------------------------------------------------------------ homografia

test("squareToQuad leva os cantos do quadrado unitário aos cantos do quadrilátero", () => {
  const m = squareToQuad(TRAPEZOID);
  assert.ok(m);
  UNIT.forEach((corner, i) => nearPoint(applyHomography(m, corner), TRAPEZOID[i], 1e-6, `canto ${i}`));
});

test("o centro do quadrado cai no cruzamento das diagonais (perspectiva, não média)", () => {
  const m = squareToQuad(TRAPEZOID);
  assert.ok(m);
  const center = applyHomography(m, { x: 0.5, y: 0.5 });
  nearPoint(center, diagonalCross(TRAPEZOID), 1e-6, "centro");
  nearPoint(quadCenter(TRAPEZOID), center, 1e-9, "quadCenter");
  // a média dos cantos é outro ponto: prova que o mapa não é afim
  const average = { x: TRAPEZOID.reduce((s, p) => s + p.x, 0) / 4, y: TRAPEZOID.reduce((s, p) => s + p.y, 0) / 4 };
  assert.ok(Math.hypot(center.x - average.x, center.y - average.y) > 1);
});

test("homografia preserva retas: pontos de uma reta do quadrado continuam alinhados", () => {
  const m = squareToQuad(TRAPEZOID);
  assert.ok(m);
  const [a, b, c] = [0.1, 0.45, 0.9].map((t) => applyHomography(m, { x: t, y: 1 - t }));
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  near(area, 0, 1e-6, "área do triângulo degenerado");
});

test("quadrado unitário para ele mesmo é a identidade e a inversa desfaz a ida", () => {
  const identity = squareToQuad(UNIT);
  assert.ok(identity);
  nearPoint(applyHomography(identity, { x: 0.3, y: 0.7 }), { x: 0.3, y: 0.7 });
  const forward = squareToQuad(TRAPEZOID) as Mat3;
  const back = quadToSquare(TRAPEZOID);
  assert.ok(back);
  const roundTrip = multiply3(back, forward);
  for (const p of [{ x: 0.2, y: 0.9 }, { x: 0.75, y: 0.1 }]) nearPoint(applyHomography(roundTrip, p), p, 1e-9);
  const inverse = invert3(forward);
  assert.ok(inverse);
  nearPoint(applyHomography(inverse, TRAPEZOID[2]), { x: 1, y: 1 }, 1e-9);
});

test("homography(from, to) leva quadrilátero a quadrilátero", () => {
  const from: Quad = [
    { x: 10, y: 20 },
    { x: 310, y: 40 },
    { x: 300, y: 260 },
    { x: 5, y: 240 },
  ];
  const m = homography(from, TRAPEZOID);
  assert.ok(m);
  from.forEach((p, i) => nearPoint(applyHomography(m, p), TRAPEZOID[i], 1e-6, `canto ${i}`));
  nearPoint(applyHomography(m, diagonalCross(from)), diagonalCross(TRAPEZOID), 1e-6, "diagonais");
});

test("três cantos alinhados não têm homografia", () => {
  const corners = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
  ];
  // qualquer trinca alinhada, em qualquer posição do quadrilátero
  for (let shift = 0; shift < 4; shift++) {
    const q = [0, 1, 2, 3].map((i) => corners[(i + shift) % 4]) as Quad;
    assert.equal(squareToQuad(q), null, `rotação ${shift}`);
    assert.equal(homography(UNIT, q), null, `rotação ${shift}`);
  }
  assert.equal(invert3([1, 2, 3, 2, 4, 6, 0, 0, 1]), null);
});

// ------------------------------------------------------------------------------------ forma do quadrilátero

test("isConvexQuad aceita retângulo e trapézio e recusa gravata, dardo e cantos alinhados", () => {
  assert.equal(isConvexQuad(UNIT), true);
  assert.equal(isConvexQuad(TRAPEZOID), true);
  const bowtie: Quad = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  const dart: Quad = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.3, y: 0.3 },
    { x: 0, y: 1 },
  ];
  const collinear: Quad = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  assert.equal(isConvexQuad(bowtie), false);
  assert.equal(isConvexQuad(dart), false);
  assert.equal(isConvexQuad(collinear), false);
});

test("área com sinal: positiva no sentido horário da tela, negativa espelhada", () => {
  near(signedArea(UNIT), 1);
  assert.equal(isMirrored(UNIT), false);
  const mirrored: Quad = [UNIT[1], UNIT[0], UNIT[3], UNIT[2]];
  near(signedArea(mirrored), -1);
  assert.equal(isMirrored(mirrored), true);
});

test("pointInQuad", () => {
  assert.equal(pointInQuad({ x: 0.5, y: 0.5 }, UNIT), true);
  assert.equal(pointInQuad({ x: 1.2, y: 0.5 }, UNIT), false);
  assert.equal(pointInQuad({ x: 500, y: 300 }, TRAPEZOID), true);
  assert.equal(pointInQuad({ x: 100, y: 100 }, TRAPEZOID), false);
});

// ------------------------------------------------------------------------------------ marcação

test("defaultQuad: retângulo centrado com a proporção da fachada em pixels da foto", () => {
  const photoAspect = 4 / 3;
  const q = defaultQuad(photoAspect, 4);
  const widthPx = (q[1].x - q[0].x) * 4000;
  const heightPx = (q[3].y - q[0].y) * 3000;
  near(widthPx / heightPx, 4, 1e-9, "proporção");
  near((q[0].x + q[1].x) / 2, 0.5, 1e-9, "centro x");
  near((q[0].y + q[3].y) / 2, 0.5, 1e-9, "centro y");
  assert.equal(isConvexQuad(q), true);
  // fachada alta numa foto larga: limita pela altura
  const tall = defaultQuad(16 / 9, 0.5);
  near(tall[3].y - tall[0].y, 0.7, 1e-9, "altura limitada");
  for (const p of [...q, ...tall]) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
});

test("setCorner e moveQuad não deixam a marcação sair da foto", () => {
  const q = defaultQuad(1, 1, 0.5);
  const moved = setCorner(q, 2, { x: 1.4, y: -0.2 });
  assert.deepEqual(moved[2], { x: 1, y: 0 });
  assert.deepEqual(moved[0], q[0]);
  const shifted = moveQuad(q, 0.9, -0.9);
  near(Math.max(...shifted.map((p) => p.x)), 1, 1e-12, "encosta na direita");
  near(Math.min(...shifted.map((p) => p.y)), 0, 1e-12, "encosta no topo");
  near(shifted[1].x - shifted[0].x, q[1].x - q[0].x, 1e-12, "mesma largura");
});

// ------------------------------------------------------------------------------------ malha

test("affineFromTriangles leva os três vértices exatamente", () => {
  const src: Tri = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 50 },
  ];
  const dst: Tri = [
    { x: 10, y: 20 },
    { x: 90, y: 35 },
    { x: 18, y: 80 },
  ];
  const m = affineFromTriangles(src, dst);
  assert.ok(m);
  src.forEach((p, i) => nearPoint(applyAffine(m, p), dst[i], 1e-9, `vértice ${i}`));
  assert.equal(
    affineFromTriangles(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      dst,
    ),
    null,
  );
});

test("perspectiveMesh: 2n² triângulos com vértices na homografia exata", () => {
  const n = 6;
  const mesh = perspectiveMesh(TRAPEZOID, 1200, 400, n);
  assert.equal(mesh.length, 2 * n * n);
  const m = squareToQuad(TRAPEZOID) as Mat3;
  for (const tri of mesh) {
    tri.src.forEach((s, k) => nearPoint(tri.dst[k], applyHomography(m, { x: s.x / 1200, y: s.y / 400 }), 1e-6, "vértice"));
  }
  // cantos da textura nos cantos marcados
  nearPoint(mesh[0].dst[0], TRAPEZOID[0], 1e-9);
  const last = mesh[mesh.length - 2];
  nearPoint(last.dst[2], TRAPEZOID[2], 1e-9);
  // dentro de cada triângulo a afim reproduz os vértices
  const affine = affineFromTriangles(mesh[7].src, mesh[7].dst);
  assert.ok(affine);
  mesh[7].src.forEach((p, k) => nearPoint(applyAffine(affine, p), mesh[7].dst[k], 1e-6));
  assert.deepEqual(perspectiveMesh([UNIT[0], UNIT[1], UNIT[1], UNIT[0]], 10, 10, 2), []);
});

test("meshDivisions: paralelogramo pede 1, perspectiva forte pede mais (até o máximo)", () => {
  const parallelogram: Quad = [
    { x: 0, y: 0 },
    { x: 800, y: 100 },
    { x: 900, y: 400 },
    { x: 100, y: 300 },
  ];
  assert.equal(meshDivisions(parallelogram), 1);
  const divisions = meshDivisions(TRAPEZOID, 24);
  assert.ok(divisions > 1 && divisions <= 24, `divisões: ${divisions}`);
  assert.equal(meshDivisions(TRAPEZOID, 3), 3);
});

test("inflateTriangle afasta cada vértice do centro e contém o triângulo original", () => {
  const tri: Tri = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 0, y: 30 },
  ];
  const big = inflateTriangle(tri, 1);
  big.forEach((p, i) => near(Math.hypot(p.x - tri[i].x, p.y - tri[i].y), 1, 1e-9, `vértice ${i}`));
  const quadOf = (t: Tri): Quad => [t[0], t[1], t[2], t[2]];
  // vértices originais ficam dentro do triângulo inflado (o quarto canto repetido não muda o teste)
  for (const p of tri) assert.equal(pointInQuad(p, quadOf(big)), true);
});

test("textureSide acompanha o tamanho da área em potências de 2", () => {
  assert.equal(textureSide(TRAPEZOID, 2048), 1024);
  assert.equal(textureSide(TRAPEZOID, 512), 512);
  const tiny: Quad = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 },
  ];
  assert.equal(textureSide(tiny, 2048), 256);
});

// ------------------------------------------------------------------------------------ encaixe e proporção

test("fitRect: Preencher cobre a caixa, Ajustar fica dentro, ambos centralizados", () => {
  const sameRect = (actual: { x: number; y: number; w: number; h: number }, expected: typeof actual) =>
    (["x", "y", "w", "h"] as const).forEach((k) => near(actual[k], expected[k], 1e-9, k));
  sameRect(fitRect(300, 100, 400, 100, "cover"), { x: 0, y: -50 / 3, w: 400, h: 400 / 3 });
  sameRect(fitRect(300, 100, 400, 100, "contain"), { x: 50, y: 0, w: 300, h: 100 });
  sameRect(fitRect(200, 100, 400, 200, "cover"), { x: 0, y: 0, w: 400, h: 200 });
});

test("ratioLabel", () => {
  assert.equal(ratioLabel(4), "4:1");
  assert.equal(ratioLabel(0.5), "1:2");
  assert.equal(ratioLabel(4 / 3), "1,33:1");
});

// ------------------------------------------------------------------------------------ resolução

test("pixels necessários: DPI = pixels ÷ (metros × 39,37)", () => {
  assert.deepEqual(requiredPixels(4, 1, DPI_MIN), { w: 7874, h: 1969 });
  assert.deepEqual(requiredPixels(4, 1.2, DPI_RECOMMENDED), { w: 15748, h: 4725 });
});

// ------------------------------------------------------------------------------------ arquivos

test("photoFileError", () => {
  assert.equal(photoFileError({ name: "loja.jpg", type: "image/jpeg", size: 3 * MB }), null);
  assert.equal(photoFileError({ name: "loja.JPG", type: "", size: MB }), null);
  assert.match(photoFileError({ name: "loja.jpg", type: "image/jpeg", size: (MAX_FILE_MB + 1) * MB }) ?? "", /25 MB/);
  assert.match(photoFileError({ name: "loja.heic", type: "image/heic", size: MB }) ?? "", /HEIC/);
  assert.match(photoFileError({ name: "loja.pdf", type: "application/pdf", size: MB }) ?? "", /JPG, PNG ou WEBP/);
  assert.equal(formatPixels(7874, 1969), "7.874 × 1.969 px");
});

// ------------------------------------------------------------------------------------ medidas

test("parseMeasure aceita vírgula, ponto e a unidade escrita", () => {
  assert.equal(parseMeasure("3,5", "m"), 350);
  assert.equal(parseMeasure(" 3.5 ", "m"), 350);
  assert.equal(parseMeasure("350", "cm"), 350);
  assert.equal(parseMeasure("120cm", "m"), 120);
  assert.equal(parseMeasure("2 m", "cm"), 200);
  assert.equal(parseMeasure("3,", "m"), 300);
  assert.equal(parseMeasure(",5", "m"), 50);
  assert.equal(parseMeasure("1,255", "m"), 125.5);
  for (const bad of ["", "abc", "0", "-2", "3x1", "1,2,3"]) assert.equal(parseMeasure(bad, "m"), null, bad);
});

test("facadeSize só devolve medida com largura e altura válidas", () => {
  assert.deepEqual(facadeSize("4", "1,2", "m"), { w: 400, h: 120 });
  assert.deepEqual(facadeSize("400", "120", "cm"), { w: 400, h: 120 });
  assert.equal(facadeSize("4", "", "m"), null);
  assert.equal(facadeSize("4", "0,05", "m"), null);
  assert.equal(facadeSize("abc", "1", "m"), null);
});

test("measureError, formatMeasureInput e facadeLabel", () => {
  assert.equal(measureError("4", "m"), null);
  assert.match(measureError("", "m") ?? "", /Informe/);
  assert.match(measureError("x", "m") ?? "", /3,5/);
  assert.match(measureError("5", "cm") ?? "", /Mínimo/);
  assert.match(measureError("60", "m") ?? "", /Máximo de 50 m/);
  assert.equal(formatMeasureInput(350, "m"), "3,5");
  assert.equal(formatMeasureInput(350, "cm"), "350");
  assert.equal(formatMeasureInput(125.5, "m"), "1,255");
  assert.equal(facadeLabel(400, 120), "4 × 1,2 m");
  assert.equal(facadeLabel(350, 75), "3,5 × 0,75 m");
});

// ------------------------------------------------------------------------------------ luz

test("percentile, boxBlur e shadeFactor", () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 1), 5);
  assert.equal(percentile([], 0.9), 0);
  const flat = boxBlur(new Float32Array(12).fill(0.5), 4, 3, 2);
  flat.forEach((v) => near(v, 0.5, 1e-6));
  const spike = boxBlur([0, 0, 0, 0, 9, 0, 0, 0, 0], 3, 3, 1);
  near(spike[4], 1, 1e-6, "centro");
  near(spike[0], 9 / 4, 1e-6, "canto");
  assert.equal(shadeFactor(0.8, 0.8, 1), 1);
  near(shadeFactor(0.4, 0.8, 1), 0.5, 1e-9, "sombra cheia");
  near(shadeFactor(0.4, 0.8, 0.5), 0.75, 1e-9, "meia força");
  near(shadeFactor(0.05, 0.8, 1), 0.45, 1e-9, "piso");
  assert.equal(shadeFactor(0.4, 0, 1), 1);
});

// ------------------------------------------------------------------------------------ materiais e preço

test("os materiais de fachada existem no catálogo, são vendidos por m² e abrem numa variação exata", () => {
  const materials = buildFacadeMaterials(catalog.products);
  assert.equal(materials.length, FACADE_PRESETS.length, "algum material sumiu do catálogo");
  for (const [i, material] of materials.entries()) {
    const preset = FACADE_PRESETS[i];
    assert.ok(material.customSize, `${material.name} sem medida livre`);
    assert.ok(material.price > 0, `${material.name} sem preço`);
    const keys = optionKeys(material.options);
    const q = quote(material.variations, material.selection, { price: material.price, qty: 1, leadDays: material.leadDays }, keys.length);
    const chosen: Record<string, string> = q.variation?.v ?? {};
    assert.ok(q.variation?.id, `${material.name}: variação sem ID da API`);
    assert.equal(q.price, material.price, `${material.name}: preço inicial`);
    for (const [label, value] of Object.entries(preset.prefer)) {
      const key: string | undefined = Object.keys(chosen).find((k) => cleanOptionLabel(k) === label);
      assert.ok(key, `${material.name}: a opção preferida “${label}” não existe mais`);
      assert.equal(chosen[key], value, `${material.name}: ${label}`);
    }
    for (const word of preset.exclude ?? []) {
      for (const values of Object.values(material.options)) assert.ok(!values.some((v) => v.includes(word)), `${material.name} ainda oferece “${word}”`);
    }
  }
});

test("facadeQuote gira a peça quando só assim ela cabe no material", () => {
  const backlight = { minWidth: 0, maxWidth: 3.15, minHeight: 0, maxHeight: 49, minArea: 0, maxArea: 0 };
  const direct = facadeQuote(62.21, 300, 100, backlight);
  assert.equal(direct.rotated, false);
  assert.equal(direct.error, null);
  const turned = facadeQuote(62.21, 400, 100, backlight);
  assert.equal(turned.rotated, true);
  assert.equal(turned.error, null);
  near(turned.price, 248.84, 1e-9, "4 m² × 62,21");
  const pvc = { minWidth: 0, maxWidth: 2.42, minHeight: 0, maxHeight: 1.2, minArea: 0, maxArea: 0 };
  const tooBig = facadeQuote(255.36, 200, 200, pvc);
  assert.equal(tooBig.rotated, false);
  assert.match(tooBig.error ?? "", /Altura máxima/);
  const banner = { minWidth: 0, maxWidth: 0, minHeight: 0, maxHeight: 0, minArea: 0.5, maxArea: 0 };
  const small = facadeQuote(48.72, 50, 50, banner);
  near(small.billedArea, 0.5, 1e-9, "área mínima");
  assert.equal(facadeQuote(10, 0, 100, banner).error, "Informe largura e altura.");
});

test("printSize: peça girada vai ao pedido no sentido do material e passa no areaQuote do checkout", () => {
  const backlight = { minWidth: 0, maxWidth: 3.15, minHeight: 0, maxHeight: 49, minArea: 0, maxArea: 0 };
  const quoteFacade = facadeQuote(62.21, 400, 100, backlight);
  const print = printSize(400, 100, quoteFacade.rotated);
  assert.deepEqual(print, { widthCm: 100, heightCm: 400 });
  const checkout = areaQuote(62.21, print.widthCm, print.heightCm, plainAreaRules(backlight));
  assert.equal(checkout.error, null);
  assert.equal(checkout.price, quoteFacade.price);
  assert.deepEqual(printSize(300, 100, false), { widthCm: 300, heightCm: 100 });
});

test("facadeCartOptions: medida, material, opções da API e avisos para a produção", () => {
  const options = facadeCartOptions({
    widthCm: 400,
    heightCm: 120,
    material: "Lona com bainha e ilhós",
    selection: { "2 - Mídia": "Vinil Brilho", "1 - Acabamento": "Bainha e Ilhós", "3 - Impressão": "Solvente" },
    billedArea: 4.8,
    rotated: true,
  });
  assert.deepEqual(Object.keys(options), ["Fachada", "Material", "Acabamento", "Mídia", "Impressão", "Área cobrada", "Produção"]);
  assert.equal(options.Impressão, "Solvente", "a opção da API não pode ser sobrescrita");
  assert.equal(options.Fachada, "4 × 1,2 m");
  assert.equal(options["Área cobrada"], "4,8 m²");
  assert.equal(options.Produção, "Impressa girada 90° para caber no material");
});
