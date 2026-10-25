import { test } from "node:test";
import assert from "node:assert/strict";
import { caminhoSvg, contornoDaArte, contornoDo, type V2 } from "./contorno.ts";

/** Canvas RGBA W×H com os retângulos [x, y, w, h] pintados (alfa 255). */
function pintado(W: number, H: number, rects: [number, number, number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (const [rx, ry, rw, rh] of rects) {
    for (let y = ry; y < ry + rh; y += 1) for (let x = rx; x < rx + rw; x += 1) data[(y * W + x) * 4 + 3] = 255;
  }
  return data;
}

const caixa = (loop: V2[]) => ({
  minX: Math.min(...loop.map((p) => p[0])),
  maxX: Math.max(...loop.map((p) => p[0])),
  minY: Math.min(...loop.map((p) => p[1])),
  maxY: Math.max(...loop.map((p) => p[1])),
});

test("lona com corte especial e quadro com LED têm contorno; o resto não", () => {
  assert.equal(contornoDo({ kind: "banner", variant: "raw", name: "lona s/ acabamento c/ corte especial" })?.anexo, "Faca de Corte");
  assert.equal(contornoDo({ kind: "neon", variant: "frame", name: "quadro acrilico com led neon" })?.anexo, "Posição do Led");
  assert.equal(contornoDo({ kind: "banner", variant: "raw", name: "lona s/ acabamento" }), null);
  assert.equal(contornoDo({ kind: "neon", variant: null, name: "crie sua frase em led neon" }), null);
});

test("o contorno segue o desenho com a margem", () => {
  const r = contornoDaArte(pintado(60, 60, [[20, 20, 20, 20]]), 60, 60, 5);
  assert.ok(r);
  assert.equal(r.cheio, false);
  assert.equal(r.loops.length, 1);
  const b = caixa(r.loops[0]);
  // Desenho de 20 a 40 px, engrossado 5 px (o Chaikin arredonda os cantos para dentro).
  assert.ok(b.minX > 13 && b.minX < 16.5, `minX ${b.minX}`);
  assert.ok(b.maxX > 43.5 && b.maxX < 47, `maxX ${b.maxX}`);
  assert.ok(b.minY > 13 && b.maxY < 47);
});

test("ilhas longe viram dois cortes; furo e ilha minúscula ficam de fora", () => {
  const duas = contornoDaArte(pintado(80, 40, [[5, 10, 15, 15], [55, 10, 15, 15]]), 80, 40, 3);
  assert.equal(duas?.loops.length, 2);
  // Anel: só o contorno de fora (o miolo vazado fica dentro do corte).
  const anel = contornoDaArte(pintado(60, 60, [[10, 10, 40, 4], [10, 46, 40, 4], [10, 10, 4, 40], [46, 10, 4, 40]]), 60, 60, 2);
  assert.equal(anel?.loops.length, 1);
  // Um pixel solto longe do desenho grande não vira corte.
  const ponto = contornoDaArte(pintado(100, 100, [[10, 10, 60, 60], [95, 95, 1, 1]]), 100, 100, 1);
  assert.equal(ponto?.loops.length, 1);
});

test("desenho que sangra: o caminho fica a uma distância da borda", () => {
  // Faixa encostada na esquerda; com 4 px de borda, nenhum ponto passa de 3,5 (o canvas começa em -0,5).
  const r = contornoDaArte(pintado(50, 50, [[0, 20, 20, 10]]), 50, 50, 3, 4);
  assert.ok(r);
  assert.ok(Math.min(...r.loops[0].map((p) => p[0])) >= 3.5 - 1e-9);
});

test("arte sem transparência dá a borda da peça; arte vazia, nada", () => {
  assert.equal(contornoDaArte(pintado(30, 20, [[0, 0, 30, 20]]), 30, 20, 2)?.cheio, true);
  assert.equal(contornoDaArte(new Uint8ClampedArray(30 * 20 * 4), 30, 20, 2), null);
});

test("caminho SVG com a escala do arquivo", () => {
  const d = caminhoSvg(
    [
      [
        [0, 0],
        [10, 0],
        [10, 5],
      ],
    ],
    ([x, y]) => [x * 2, y * 0.333],
  );
  assert.equal(d, "M0 0L20 0L20 1.67Z");
});
