import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeImage, autoFit, canvasLimitsFor, contentBox, describeFit, dpiTargets, focusInside, formatPlan, hasWhiteBackground, previewScale, printQuality, removeBorderBackground, textureLongSide, worthTrimming, type Pixels } from "./image-prep.ts";

/* Tratador automático da imagem enviada: pixels sintéticos, sem DOM. */

function canvas(w: number, h: number, fill: [number, number, number, number]): Pixels {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) data.set(fill, i * 4);
  return { data, width: w, height: h };
}
function rect(p: Pixels, x0: number, y0: number, x1: number, y1: number, c: [number, number, number, number]) {
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) p.data.set(c, (y * p.width + x) * 4);
}
/** "Foto": ruído colorido em toda a imagem e um objeto texturizado fora do centro. */
function photo(w: number, h: number, obj: { x: number; y: number; r: number }): Pixels {
  const p = canvas(w, h, [0, 0, 0, 255]);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const t = y / h;
      const inObj = (x - obj.x * w) ** 2 + (y - obj.y * h) ** 2 < (obj.r * w) ** 2;
      const n = inObj ? (((x >> 1) + (y >> 1)) % 2) * 160 + rnd() * 60 : rnd() * 18;
      p.data.set([60 + 90 * t + n, 110 - 40 * t + n * 0.6, 150 + n * 0.3, 255], (y * w + x) * 4);
    }
  return p;
}

const CARD = { areaAspect: 9 / 5, areaCm: { w: 9, h: 5 } };

test("logo PNG com margem transparente: é arte, a margem sai e ele entra inteiro e centralizado", () => {
  const p = canvas(200, 200, [0, 0, 0, 0]);
  rect(p, 80, 86, 120, 114, [220, 30, 60, 255]);
  const a = analyzeImage(p);
  assert.equal(a.kind, "graphic");
  assert.ok(a.border.transparent);
  assert.ok(worthTrimming(a));
  assert.ok(Math.abs(a.content.x - 0.395) < 0.01 && Math.abs(a.content.w - 0.21) < 0.015, JSON.stringify(a.content));
  const fit = autoFit(a, { ...CARD, px: { w: 2000, h: 1400 } });
  assert.equal(fit.mode, "whole");
  assert.equal(fit.overflow, false);
  assert.deepEqual([fit.placement.x, fit.placement.y], [0.5, 0.5]);
  assert.equal(fit.background, null, "transparente: mantém o fundo escolhido");
});

test("logo JPG em fundo branco: fundo da arte vira a cor da borda (sem quadrado branco sobrando)", () => {
  const p = canvas(250, 150, [254, 254, 253, 255]);
  rect(p, 90, 40, 160, 110, [20, 80, 200, 255]);
  const a = analyzeImage(p);
  assert.equal(a.kind, "graphic");
  const fit = autoFit(a, { ...CARD, px: { w: 1400, h: 1400 } });
  assert.equal(fit.background, "#fefefd");
  assert.equal(autoFit(a, { ...CARD, px: { w: 1400, h: 1400 }, transparentBase: true }).background, null, "camisa/sacola: o fundo não é impresso");
});

test("logo pequeno não estica além da resolução mínima (180×120 px num cartão de 9 cm)", () => {
  const p = canvas(180, 120, [0, 0, 0, 0]);
  rect(p, 10, 10, 170, 110, [20, 80, 200, 255]);
  const fit = autoFit(analyzeImage(p), { ...CARD, px: { w: 180, h: 120 } });
  assert.equal(fit.limitedByDpi, true);
  assert.ok((fit.dpi ?? 0) >= 149, `dpi ${fit.dpi}`);
  assert.ok(fit.placement.scale < 0.84);
  // Vetor imprime nítido em qualquer tamanho: não limita.
  assert.equal(autoFit(analyzeImage(p), { ...CARD, px: { w: 180, h: 120 }, vector: true }).limitedByDpi, false);
});

test("caneca: o logo fica na parte da volta que aparece de frente", () => {
  const p = canvas(300, 300, [0, 0, 0, 0]);
  rect(p, 20, 20, 280, 280, [20, 80, 200, 255]);
  const fit = autoFit(analyzeImage(p), { areaAspect: 20 / 8.5, areaCm: { w: 20, h: 8.5 }, px: { w: 3000, h: 3000 }, frontWindow: 0.38 });
  const base = Math.min(1, 1 / (20 / 8.5)); // logo quadrado numa faixa 20×8,5: contido pela altura
  assert.ok(base * fit.placement.scale <= 0.38 * 0.9 + 1e-9, String(fit.placement.scale));
});

test("foto 3:2 na caneca (20×8,5): preenche a área centrada no assunto, sem faixa vazia", () => {
  const p = photo(240, 160, { x: 0.3, y: 0.35, r: 0.12 });
  const a = analyzeImage(p);
  assert.equal(a.kind, "photo");
  assert.ok(a.focus.x < 0.45, `foco ${JSON.stringify(a.focus)}`);
  const fit = autoFit(a, { areaAspect: 20 / 8.5, areaCm: { w: 20, h: 8.5 }, px: { w: 4000, h: 2667 } });
  assert.equal(fit.mode, "fill");
  assert.equal(fit.overflow, true);
  // Cobre a área inteira e o centro da imagem desce para o assunto (que está acima do meio) ficar na frente.
  assert.ok(fit.placement.y > 0.5, `y ${fit.placement.y}`);
  assert.ok(fit.cropLoss > 0.3 && fit.cropLoss < 0.4, String(fit.cropLoss));
});

test("foto em pé num cartão deitado: cortaria demais, entra inteira com o fundo da borda", () => {
  const p = photo(120, 160, { x: 0.5, y: 0.3, r: 0.15 });
  const fit = autoFit(analyzeImage(p), { ...CARD, px: { w: 3000, h: 4000 } });
  assert.equal(fit.mode, "whole");
  assert.ok(fit.background, "fundo da cor da borda completa a área");
  // O cliente pode pedir "Preencher a área" mesmo assim.
  assert.equal(autoFit(analyzeImage(p), { ...CARD, px: { w: 3000, h: 4000 } }, "fill").mode, "fill");
});

test("fundo branco do logo sai (camisa/sacola), mas o branco de dentro do logo fica", () => {
  const p = canvas(60, 60, [255, 255, 255, 255]);
  rect(p, 15, 15, 45, 45, [10, 40, 160, 255]); // quadrado azul
  rect(p, 25, 25, 35, 35, [255, 255, 255, 255]); // "furo" branco DENTRO do logo
  const a = analyzeImage(p);
  assert.ok(hasWhiteBackground(a));
  const removed = removeBorderBackground(p, a.border.rgb);
  assert.ok(removed >= 60 * 60 - 30 * 30 - 4, String(removed));
  assert.equal(p.data[(2 * 60 + 2) * 4 + 3], 0, "canto: transparente");
  assert.equal(p.data[(30 * 60 + 30) * 4 + 3], 255, "branco de dentro: opaco");
  assert.equal(p.data[(20 * 60 + 20) * 4 + 3], 255, "logo: opaco");
});

test("foco dentro do recorte e frase do que foi feito", () => {
  assert.deepEqual(focusInside({ x: 0.5, y: 0.5 }, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }), { x: 0.5, y: 0.5 });
  const p = photo(240, 160, { x: 0.5, y: 0.5, r: 0.1 });
  const fit = autoFit(analyzeImage(p), { areaAspect: 1.5, areaCm: null, px: { w: 3000, h: 2000 } });
  assert.match(describeFit(fit, { trimmed: false }), /^Ajustada automaticamente: preenchendo a área\.$/);
  assert.match(describeFit({ ...fit, mode: "whole", limitedByDpi: true }, { trimmed: true }), /margens vazias cortadas · inteira e centralizada · no maior tamanho que imprime nítido/);
});

test("textura do 3D: 2048 no computador, lado menor nunca esmagado, teto da GPU", () => {
  assert.equal(textureLongSide(20 / 8.5, { maxTexture: 16384, mobile: false }), 2048);
  assert.equal(textureLongSide(45, { maxTexture: 16384, mobile: false }), 8192);
  assert.equal(textureLongSide(45, { maxTexture: 4096, mobile: true }), 4096);
  assert.equal(textureLongSide(1, { maxTexture: 16384, mobile: true }), 1536);
});

test("cópia de prévia: até ~4 MP sem esmagar panorâmica", () => {
  const k = previewScale(8000, 600);
  assert.ok(600 * k > 500, String(600 * k));
  assert.ok(previewScale(6000, 4000) * 6000 <= 2600);
  assert.equal(previewScale(800, 600), 1);
});

test("resolução pela distância de leitura: lona aceita menos pontos que cartão", () => {
  assert.deepEqual(dpiTargets(300), { min: 50, good: 100 });
  assert.deepEqual(dpiTargets(9), { min: 150, good: 300 });
  assert.equal(printQuality(114, 90), "ok", "foto de celular num banner 60×90 não é 'baixa'");
  assert.equal(printQuality(114, 9), "baixa");
});

test("formatos: HEIC sem tipo (Windows) pela extensão; SVG; TIFF e AI com motivo claro", () => {
  assert.deepEqual(formatPlan("IMG_0001.HEIC", ""), { ok: true, decode: "heic" });
  assert.deepEqual(formatPlan("logo.svg", "image/svg+xml"), { ok: true, decode: "svg" });
  assert.deepEqual(formatPlan("foto.jfif", "image/jpeg"), { ok: true, decode: "bitmap" });
  assert.deepEqual(formatPlan("anim.gif", "image/gif"), { ok: true, decode: "bitmap" });
  assert.equal(formatPlan("arte.tif", "image/tiff").ok, false);
  assert.equal(formatPlan("logo.ai", "application/postscript").ok, false);
});

test("logo transparente com contorno a 1 px da borda: a peça não vira um retângulo da cor do contorno", () => {
  // Anel externo transparente, moldura vermelha de 6 px e miolo transparente com o logo (como o GIF do achado).
  const p = canvas(240, 150, [0, 0, 0, 0]);
  rect(p, 1, 1, 239, 149, [224, 32, 24, 255]);
  rect(p, 7, 7, 233, 143, [0, 0, 0, 0]);
  rect(p, 90, 50, 150, 100, [20, 80, 200, 255]);
  const a = analyzeImage(p);
  assert.equal(a.kind, "graphic");
  assert.equal(a.border.uniform && !a.border.transparent, false, JSON.stringify(a.border));
  const fit = autoFit(a, { ...CARD, px: { w: 2400, h: 1500 } });
  assert.equal(fit.background, null);
});

test("filete de moldura de 1–2% numa arte opaca não vira o fundo da peça", () => {
  for (const stroke of [2, 3]) {
    const p = canvas(256, 170, [246, 239, 217, 255]);
    rect(p, 0, 0, 256, stroke, [26, 42, 90, 255]);
    rect(p, 0, 170 - stroke, 256, 170, [26, 42, 90, 255]);
    rect(p, 0, 0, stroke, 170, [26, 42, 90, 255]);
    rect(p, 256 - stroke, 0, 256, 170, [26, 42, 90, 255]);
    rect(p, 80, 40, 176, 130, [34, 170, 102, 255]);
    const fit = autoFit(analyzeImage(p), { ...CARD, px: { w: 3000, h: 2000 } });
    assert.notEqual(fit.background, "#1a2a5a", `moldura de ${stroke} px`);
  }
});

test("margem: traço fino e tagline clara ficam dentro do corte (qualquer pixel fora do fundo conta)", () => {
  const p = canvas(400, 300, [255, 255, 255, 255]);
  rect(p, 150, 100, 250, 180, [20, 20, 20, 255]); // logo
  rect(p, 40, 250, 360, 251, [236, 236, 236, 255]); // tagline clara de 1 px, bem mais larga que o logo
  const a = analyzeImage(p);
  const box = contentBox(p, a.border);
  assert.ok(box.x * 400 <= 40 && (box.x + box.w) * 400 >= 360, `x ${JSON.stringify(box)}`);
  assert.ok((box.y + box.h) * 300 >= 251, `y ${JSON.stringify(box)}`);
});

test("imagem chapada (só fundo) não é cortada para um canto", () => {
  const p = canvas(40, 30, [200, 30, 40, 255]);
  const a = analyzeImage(p);
  assert.deepEqual(contentBox(p, a.border), { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(worthTrimming(a), false);
});

test("foto de estúdio em fundo branco (luz variando aos poucos) é foto: sem corte nem remoção do fundo", () => {
  const w = 200;
  const h = 260;
  const p = canvas(w, h, [252, 252, 252, 255]);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      // Camiseta branca com sombreamento de volume e dobras, encostando na borda de baixo.
      const inShirt = y > 120 && Math.abs(x - 100) < 40 + (y - 120) * 0.4;
      if (!inShirt) continue;
      // Malha do tecido: variação fina de poucos níveis, como numa foto de verdade.
      const shade = 236 - 28 * (Math.abs(x - 100) / 90) ** 2 - 10 * Math.sin(x / 6) ** 2 + ((x * 7 + y * 13) % 5) - 2;
      p.data.set([shade, shade, shade - 2, 255], (y * w + x) * 4);
    }
  const a = analyzeImage(p);
  assert.equal(a.kind, "photo", JSON.stringify({ colors: a.colors, flat: a.flat, soft: a.soft }));
  assert.equal(worthTrimming(a), false);
  assert.equal(hasWhiteBackground(a), false);
});

test("encaixe no limite da resolução: nunca vira 'baixa' pelo arredondamento", () => {
  const p = canvas(180, 120, [0, 0, 0, 0]);
  rect(p, 10, 10, 170, 110, [20, 80, 200, 255]);
  const fit = autoFit(analyzeImage(p), { ...CARD, px: { w: 180, h: 120 } });
  assert.equal(printQuality(fit.dpi ?? 0, 9), "ok", `dpi ${fit.dpi}`);
  assert.equal(printQuality(149.6, 9), "ok", "meio ponto de folga");
});

test("verso: formato sem prévia não promete anexo; teto de canvas do iPhone", () => {
  const plan = formatPlan("logo.cdr", "", false);
  assert.equal(plan.ok, false);
  assert.doesNotMatch(plan.ok ? "" : plan.reason, /anexad/);
  assert.deepEqual(canvasLimitsFor("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), { pixels: 16_000_000, side: 4096 });
  assert.deepEqual(canvasLimitsFor("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), { pixels: 16_000_000, side: 4096 });
  assert.equal(canvasLimitsFor("Mozilla/5.0 (Windows NT 10.0; Win64; x64)").pixels, 40_000_000);
});
