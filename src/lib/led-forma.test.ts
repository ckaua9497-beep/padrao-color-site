import { test } from "node:test";
import assert from "node:assert/strict";
import type { V2 } from "./contorno.ts";
import { LED_RAIO_CM, arredondarCantos, casco, comprimento, interpretarTraco, rdpFechado } from "./led-forma.ts";

const QUADRO = { widthCm: 60, heightCm: 70 };

/** Ruído com semente (o mesmo a cada execução). */
function ruido(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
}

/** Traço à mão em cm (tremido de ±`amp` cm), devolvido em fração do quadro. */
function aMao(cm: [number, number][], amp: number, seed = 7): V2[] {
  const r = ruido(seed);
  return cm.map(([x, y]): V2 => [(x + r() * amp * 2) / QUADRO.widthCm, (y + r() * amp * 2) / QUADRO.heightCm]);
}

/** Pontos ao longo dos segmentos, a cada `passo` cm. */
function percurso(vertices: [number, number][], passo = 0.4, fechar = false): [number, number][] {
  const v = fechar ? [...vertices, vertices[0]] : vertices;
  const out: [number, number][] = [];
  for (let i = 1; i < v.length; i += 1) {
    const [ax, ay] = v[i - 1];
    const [bx, by] = v[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / passo));
    for (let k = 0; k < n; k += 1) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  if (!fechar) out.push(v[v.length - 1]);
  return out;
}

const emCm = (pts: V2[]): [number, number][] => pts.map(([x, y]) => [x * QUADRO.widthCm, y * QUADRO.heightCm]);
const caixa = (pts: [number, number][]) => ({
  x0: Math.min(...pts.map((p) => p[0])),
  x1: Math.max(...pts.map((p) => p[0])),
  y0: Math.min(...pts.map((p) => p[1])),
  y1: Math.max(...pts.map((p) => p[1])),
});

test("retângulo tremido em volta de um cartão vira retângulo alinhado com cantos no raio da fita", () => {
  const ret = percurso(
    [
      [10, 12],
      [42, 12],
      [42, 34],
      [10, 34],
    ],
    0.4,
    true,
  );
  const r = interpretarTraco(aMao(ret, 0.7), true, QUADRO);
  assert.equal(r.forma, "retangulo");
  assert.equal(r.fechada, true);
  const b = caixa(emCm(r.pontos));
  assert.ok(Math.abs(b.x0 - 10) < 1 && Math.abs(b.x1 - 42) < 1, JSON.stringify(b));
  assert.ok(Math.abs(b.y0 - 12) < 1 && Math.abs(b.y1 - 34) < 1, JSON.stringify(b));
  // Lados retos: o topo tem muitos pontos com o mesmo y.
  const topo = emCm(r.pontos).filter(([, y]) => Math.abs(y - b.y0) < 0.01);
  assert.ok(topo.length >= 2);
  // Perímetro do retângulo de cantos arredondados: 2(32+22) − (8 − 2π)·r.
  const esperado = 2 * (32 + 22) - (8 - 2 * Math.PI) * LED_RAIO_CM;
  assert.ok(Math.abs(comprimento(emCm(r.pontos), true) - esperado) < 2.5, `${comprimento(emCm(r.pontos), true)} × ${esperado}`);
});

test("retângulo um pouco torto (3°) é endireitado", () => {
  const a = 3 * (Math.PI / 180);
  const rot = ([x, y]: [number, number]): [number, number] => [30 + (x - 30) * Math.cos(a) - (y - 30) * Math.sin(a), 30 + (x - 30) * Math.sin(a) + (y - 30) * Math.cos(a)];
  const ret = percurso(
    [
      [15, 20],
      [45, 20],
      [45, 40],
      [15, 40],
    ],
    0.4,
    true,
  ).map(rot);
  const r = interpretarTraco(aMao(ret, 0.4, 3), true, QUADRO);
  assert.equal(r.forma, "retangulo");
  const pts = emCm(r.pontos);
  const b = caixa(pts);
  assert.ok(pts.filter(([, y]) => Math.abs(y - b.y0) < 0.01).length >= 2, "topo reto e horizontal");
});

test("círculo e elipse tremidos", () => {
  const circ = Array.from({ length: 160 }, (_, i): [number, number] => [30 + 12 * Math.cos((i / 160) * 2 * Math.PI), 35 + 12 * Math.sin((i / 160) * 2 * Math.PI)]);
  const c = interpretarTraco(aMao(circ, 0.6, 11), true, QUADRO);
  assert.equal(c.forma, "circulo");
  const pts = emCm(c.pontos);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const raios = pts.map(([x, y]) => Math.hypot(x - cx, y - cy));
  assert.ok(Math.max(...raios) - Math.min(...raios) < 0.05, "círculo perfeito");
  assert.ok(Math.abs(raios[0] - 12) < 0.5 && Math.hypot(cx - 30, cy - 35) < 0.5, `raio ${raios[0]}, centro ${cx},${cy}`);

  const elip = Array.from({ length: 180 }, (_, i): [number, number] => [30 + 18 * Math.cos((i / 180) * 2 * Math.PI), 35 + 9 * Math.sin((i / 180) * 2 * Math.PI)]);
  assert.equal(interpretarTraco(aMao(elip, 0.5, 5), true, QUADRO).forma, "elipse");
});

test("traço quase reto vira uma reta; meia volta não vira elipse", () => {
  const reta = percurso([
    [8, 50],
    [50, 52],
  ]);
  const r = interpretarTraco(aMao(reta, 0.5, 2), false, QUADRO);
  assert.equal(r.forma, "reta");
  assert.equal(r.pontos.length, 2);

  const arco = Array.from({ length: 80 }, (_, i): [number, number] => [30 + 12 * Math.cos((i / 80) * Math.PI), 35 + 12 * Math.sin((i / 80) * Math.PI)]);
  const a = interpretarTraco(aMao(arco, 0.3, 9), false, QUADRO);
  assert.equal(a.forma, "livre");
  assert.equal(a.fechada, false);
});

test("triângulo vira polígono de cantos arredondados", () => {
  const tri = percurso(
    [
      [30, 10],
      [50, 45],
      [10, 45],
    ],
    0.4,
    true,
  );
  const r = interpretarTraco(aMao(tri, 0.5, 13), true, QUADRO);
  assert.equal(r.forma, "poligono");
  // Sem bico: a maior virada entre segmentos seguidos é pequena (os cantos viraram arcos).
  const pts = emCm(r.pontos);
  let maior = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[i];
    const c = pts[(i + 1) % pts.length];
    const v1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const v2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = Math.abs(v2 - v1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    maior = Math.max(maior, d);
  }
  assert.ok(maior < 0.5, `virada de ${maior} rad`);
});

test("traço livre perde o tremido e os pontos sobrando", () => {
  const onda = Array.from({ length: 200 }, (_, i): [number, number] => [8 + i * 0.22, 35 + 6 * Math.sin(i / 18)]);
  const bruto = aMao(onda, 0.6, 21);
  const r = interpretarTraco(bruto, false, QUADRO);
  assert.equal(r.forma, "livre");
  // Mais curto que o tremido (o tremido soma comprimento) e sem ficar menor que a onda.
  assert.ok(comprimento(emCm(r.pontos), false) < comprimento(emCm(bruto), false));
  assert.ok(comprimento(emCm(r.pontos), false) > 40);
});

test("utilidades: cantos arredondados, casco e RDP fechado", () => {
  const q: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const arred = arredondarCantos(q, 2, true);
  assert.ok(arred.length > 8);
  assert.ok(Math.abs(comprimento(arred, true) - (40 - (8 - 2 * Math.PI) * 2)) < 0.3);
  assert.equal(casco([...q, [5, 5]]).length, 4);
  assert.equal(rdpFechado(percurso(q, 0.5, true), 0.1).length, 4);
});

test("cartão com o prendedor embaixo (o caso da imagem): polígono limpo, sem tremido nem bico", () => {
  const contorno = percurso(
    [
      [10, 12],
      [42, 12],
      [42, 32],
      [32, 32],
      [32, 41],
      [24, 41],
      [24, 32],
      [10, 32],
    ],
    0.4,
    true,
  );
  const r = interpretarTraco(aMao(contorno, 0.7, 17), true, QUADRO);
  assert.equal(r.forma, "poligono");
  const pts = emCm(r.pontos);
  const b = caixa(pts);
  assert.ok(Math.abs(b.y1 - 41) < 1.2 && Math.abs(b.x0 - 10) < 1.2, JSON.stringify(b));
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const p = pts[i];
    const c = pts[(i + 1) % pts.length];
    let d = Math.abs(Math.atan2(c[1] - p[1], c[0] - p[0]) - Math.atan2(p[1] - a[1], p[0] - a[0]));
    if (d > Math.PI) d = 2 * Math.PI - d;
    assert.ok(d < 0.5, `bico de ${d} rad no ponto ${i}`);
  }
});
