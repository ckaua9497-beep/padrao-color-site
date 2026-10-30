import { test } from "node:test";
import assert from "node:assert/strict";
import { placasDoMosaico } from "./mosaico.ts";

const medidas = (larguraCm: number, alturaCm: number) => placasDoMosaico(larguraCm, alturaCm).placas.map((p) => `${p.w}x${p.h}`);

test("mosaico: as placas do gabarito oficial em cada formato", () => {
  assert.deepEqual(medidas(100, 100), ["33x75", "33x100", "33x75"]);
  assert.deepEqual(medidas(150, 100), ["30x55", "30x75", "30x100", "30x75", "30x55"]);
  assert.deepEqual(medidas(200, 100), ["40x60", "40x80", "40x100", "40x80", "40x60"]);
});

test("mosaico: conjunto com os vãos, centrado e simétrico", () => {
  const { placas, larguraCm, alturaCm } = placasDoMosaico(150, 100);
  assert.equal(larguraCm, 5 * 30 + 4 * 3, "162 cm, como as 5 placas do gabarito (centros a cada 33 cm)");
  assert.equal(alturaCm, 100);
  assert.ok(Math.abs(placas[1].x - placas[0].x - 33) < 1e-9);
  assert.ok(Math.abs(placas[0].x + placas[4].x) < 1e-9, "simétrico em torno do centro");
  assert.ok(placas.every((p) => p.y === 0), "centradas na altura");
  assert.ok(Math.abs(placas[0].x - placas[0].w / 2 + larguraCm / 2) < 1e-9, "a primeira placa começa na borda do conjunto");
  assert.equal(placasDoMosaico(100, 100).larguraCm, 3 * 33 + 2 * 2.3);
});
