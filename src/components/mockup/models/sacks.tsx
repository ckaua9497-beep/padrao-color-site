"use client";

// Sacola plástica de PEAD (alça vazada "boca de palhaço" ou alça fita soldada) e saco de papel kraft sem alça,
// com fole lateral, fundo quadrado (SOS) e boca serrilhada.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { useApparelArt, useGeometriesCleanup } from "./fabric";
import { Dimensions, backVariant, sizeLabels, useArtTexture, type ModelProps } from "./shared";

/*
 * Tudo em centímetros, reduzido por um único fator de escala por peça (proporção real).
 *
 * Sacola plástica: as duas faces saem da folha plana do filme, em coordenadas (s, t) em cm (s na largura,
 * centrado; t na altura, a partir do fundo). A sacola levemente cheia ganha uma barriga z(s, t) que some nas
 * soldas, e x/y vêm do comprimento de arco ao longo de cada linha e de cada coluna: o filme não estica, então
 * as laterais puxam para dentro no meio, os cantos ficam em orelha e a boca cede no centro. A estampa usa as
 * mesmas coordenadas da folha e acompanha a barriga sem distorcer. O recorte da alça vazada é um alphaMap.
 *
 * Saco kraft: frente, costas, as duas meias-faces de cada fole e o fundo são grades próprias (vincos nítidos
 * entre elas). Aberto, o vinco central do fole recua para dentro perto da boca e a frente arredonda; embaixo,
 * o triângulo do fundo SOS mantém o vinco em diagonal. A boca serrilhada é a última linha da grade, em
 * zigue-zague. A tinta do silk multiplica o pardo do papel (como tinta sobre kraft de verdade).
 */

/** Maior dimensão da cena, em unidades. */
const TARGET = 2.4;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;
const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/** Medida do pedido em cm, com faixa sã (evita NaN, zero e tamanhos absurdos). */
function cm(value: number, fallback: number, min: number, max: number) {
  return Number.isFinite(value) && value > 0 ? clamp(value, min, max) : fallback;
}

/** Luminância em espaço linear. */
function luma(color: string) {
  const c = new THREE.Color(color);
  return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// ---------------------------------------------------------------------------- malhas

type GridSpec = {
  nu: number;
  nv: number;
  at: (i: number, j: number, out: THREE.Vector3) => void;
  uv: (i: number, j: number) => [number, number];
  /** Para onde a face da frente deve olhar (a grade inverte a ordem dos triângulos se preciso). */
  outward: THREE.Vector3;
  /** Tom por vértice (atributo color): o lado de dentro escurece com a profundidade. */
  tone?: (i: number, j: number) => number;
};

function gridGeometry({ nu, nv, at, uv, outward, tone }: GridSpec) {
  const count = (nu + 1) * (nv + 1);
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = tone ? new Float32Array(count * 3) : null;
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) {
      const k = j * (nu + 1) + i;
      at(i, j, p);
      positions[k * 3] = p.x;
      positions[k * 3 + 1] = p.y;
      positions[k * 3 + 2] = p.z;
      const [u, v] = uv(i, j);
      uvs[k * 2] = u;
      uvs[k * 2 + 1] = v;
      if (colors && tone) colors.fill(tone(i, j), k * 3, k * 3 + 3);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  // Normal média da grade inteira (robusta em superfícies curvas e em triângulos degenerados da serrilha).
  const sum = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  for (let k = 0; k < indices.length; k += 3) {
    A.fromArray(positions, indices[k] * 3);
    B.fromArray(positions, indices[k + 1] * 3).sub(A);
    C.fromArray(positions, indices[k + 2] * 3).sub(A);
    sum.add(B.cross(C));
  }
  if (sum.dot(outward) < 0) {
    for (let k = 0; k < indices.length; k += 3) {
      const tmp = indices[k + 1];
      indices[k + 1] = indices[k + 2];
      indices[k + 2] = tmp;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  if (colors) geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Seção de fita (retângulo de cantos bem arredondados), em frações de largura × espessura.
const STRAP_PROFILE = Array.from({ length: 14 }, (_, k) => {
  const a = (k / 14) * Math.PI * 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: Math.sign(c) * Math.abs(c) ** 0.3 * 0.5, y: Math.sign(s) * Math.abs(s) ** 0.3 * 0.5 };
});

/** Fita plana varrida sobre uma curva, com a face larga olhando para `facing` (alça de fita da sacola). */
function strapGeometry(points: THREE.Vector3[], width: number, thick: number, facing: THREE.Vector3, samples = 96) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const m = STRAP_PROFILE.length;
  const pos: number[] = [];
  const idx: number[] = [];
  const prevW = AXIS_X.clone();
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    const P = curve.getPointAt(u);
    const T = curve.getTangentAt(u);
    const W = T.clone().cross(facing);
    if (W.lengthSq() < 1e-8) W.copy(prevW);
    else W.normalize();
    prevW.copy(W);
    const N = T.clone().cross(W).normalize();
    for (let k = 0; k < m; k += 1) {
      const q = P.clone().addScaledVector(W, STRAP_PROFILE[k].x * width).addScaledVector(N, STRAP_PROFILE[k].y * thick);
      pos.push(q.x, q.y, q.z);
    }
  }
  for (let i = 0; i < samples; i += 1) {
    for (let k = 0; k < m; k += 1) {
      const k2 = (k + 1) % m;
      const a = i * m + k;
      const b = i * m + k2;
      const c = (i + 1) * m + k;
      const d = (i + 1) * m + k2;
      idx.push(a, b, c, b, d, c);
    }
  }
  // Tampas das pontas (ficam por dentro da sacola, mas fecham a malha).
  for (const [ring, flip] of [
    [0, true],
    [samples, false],
  ] as [number, boolean][]) {
    const center = new THREE.Vector3();
    for (let k = 0; k < m; k += 1) center.add(new THREE.Vector3().fromArray(pos, (ring * m + k) * 3));
    center.divideScalar(m);
    const ci = pos.length / 3;
    pos.push(center.x, center.y, center.z);
    for (let k = 0; k < m; k += 1) {
      const a = ring * m + k;
      const b = ring * m + ((k + 1) % m);
      if (flip) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------- sacola plástica: o filme

/** Faixa achatada da solda lateral e "saia" do fundo abaixo da solda (cm). */
const SIDE_SEAL = 0.6;
const BOTTOM_SEAL = 1.1;
/** Área de impressão do silk (cm): 20 × 25 na frente, centralizada. */
const BAG_PRINT: [number, number] = [20, 25];
/** Alça fita: altura da faixa dobrada e soldada na boca e largura da fita (cm). */
const BAND = 3.6;
const STRAP_W = 2.4;

type Film = { W: number; H: number; ns: number; nt: number; x: Float32Array; y: Float32Array; z: Float32Array };

/** Vinco solto do filme: segmento centrado em (s0, t0), direção (dx, dy), meia largura `w` e altura `a` (cm). */
type Crease = { s0: number; t0: number; dx: number; dy: number; len: number; w: number; a: number };

/**
 * Vincos do PEAD (a sobra do filme quando a sacola fica em pé): mais junto do fundo e das laterais, subindo em
 * diagonal para o meio, e alguns soltos pelo corpo. São eles que quebram o reflexo em manchas, como nas fotos.
 */
function filmCreases(W: number, H: number): Crease[] {
  const rand = seeded(31);
  const list: Crease[] = [];
  for (let k = 0; k < 30; k += 1) {
    const side = rand() < 0.5 ? -1 : 1;
    const edge = rand() < 0.55;
    const s0 = edge ? side * (W / 2 - SIDE_SEAL - rand() * W * 0.2) : (rand() - 0.5) * W * 0.75;
    const t0 = rand() < 0.5 ? BOTTOM_SEAL + 1 + rand() * H * 0.3 : BOTTOM_SEAL + 1 + rand() * (H - 7);
    const ang = edge ? Math.PI / 2 + side * (0.5 + rand() * 0.6) : rand() * Math.PI;
    list.push({ s0, t0, dx: Math.cos(ang), dy: Math.sin(ang), len: 3 + rand() * 9, w: 0.45 + rand() * 1.1, a: (rand() < 0.5 ? -1 : 1) * (0.07 + rand() * 0.2) });
  }
  return list;
}

/** Relevo de um vinco no ponto (s, t): crista meio arredondada, meio viva, que some nas pontas. */
function creaseAt(c: Crease, s: number, t: number) {
  const rx = s - c.s0;
  const ry = t - c.t0;
  const along = rx * c.dx + ry * c.dy;
  const across = Math.abs(ry * c.dx - rx * c.dy);
  if (across > c.w * 4) return 0;
  const taper = 1 - ((2 * along) / c.len) ** 2;
  if (taper <= 0) return 0;
  const q = across / c.w;
  return c.a * taper * (0.6 * Math.exp(-q * q) + 0.4 * Math.exp(-1.8 * q));
}

/**
 * Folha da frente da sacola em pé (a de trás é o espelho em z): quase plana, como nas fotos. Abre pouco acima da
 * solda do fundo e volta a fechar na boca; por cima, ondulação larga e os vincos do filme.
 */
function filmShape(W: number, H: number, loop: boolean): Film {
  const ns = 120;
  const nt = 160;
  const stride = ns + 1;
  const n = stride * (nt + 1);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  const creases = filmCreases(W, H);
  const belly = clamp(Math.min(W, H) * 0.035, 0.5, 1.6);
  const span = W / 2 - SIDE_SEAL * 0.5;
  const bandAt = H - BAND;
  for (let j = 0; j <= nt; j += 1) {
    const t = (j / nt) * H;
    // A alça fita puxa as duas faces juntas na boca; a vazada fica um tico aberta.
    const body = smooth(t, BOTTOM_SEAL, BOTTOM_SEAL + 7) * lerp(1, loop ? 0.45 : 0.6, smooth(t, H * 0.45, H));
    // Rugas: somem nas soldas e ficam fracas na faixa dobrada (filme duplo, mais duro) da alça fita.
    const tm = smooth(t, BOTTOM_SEAL, BOTTOM_SEAL + 0.8) * (loop ? lerp(1, 0.3, smooth(t, bandAt - 0.4, bandAt)) : 1);
    // Franzido logo abaixo da solda da faixa: ondas curtas na horizontal.
    const gather = loop ? Math.exp(-(((t - (bandAt - 1.1)) / 1) ** 2)) : 0;
    for (let i = 0; i <= ns; i += 1) {
      const s = -W / 2 + (i / ns) * W;
      const r = clamp((W / 2 - Math.abs(s) - SIDE_SEAL * 0.5) / span, 0, 1);
      const gx = 1 - (1 - r) ** 2.6;
      let w = 0.16 * Math.sin(s * 0.33 + t * 0.21 + 1.3) * Math.sin(t * 0.17 - s * 0.27 + 0.4) + 0.08 * Math.sin(s * 0.61 - t * 0.43 + 2.1);
      for (const c of creases) w += creaseAt(c, s, t);
      w += gather * 0.07 * Math.sin(s * 1.9 + Math.sin(s * 0.7) * 1.5);
      z[j * stride + i] = Math.max(belly * gx * body + smooth(r, 0, 0.06) * tm * w, 0.03 * smooth(r, 0, 0.04));
    }
  }
  // Comprimento de arco: cada trecho da grade mede o mesmo que na folha plana.
  const ds = W / ns;
  const dt = H / nt;
  const step = (d: number, dz: number) => Math.sqrt(Math.max(d * d - dz * dz, 0.09 * d * d));
  const mid = ns / 2;
  for (let j = 0; j <= nt; j += 1) {
    const row = j * stride;
    x[row + mid] = 0;
    for (let i = mid + 1; i <= ns; i += 1) x[row + i] = x[row + i - 1] + step(ds, z[row + i] - z[row + i - 1]);
    for (let i = mid - 1; i >= 0; i -= 1) x[row + i] = x[row + i + 1] - step(ds, z[row + i] - z[row + i + 1]);
  }
  for (let i = 0; i <= ns; i += 1) {
    y[i] = 0;
    for (let j = 1; j <= nt; j += 1) {
      const k = j * stride + i;
      y[k] = y[k - stride] + step(dt, z[k] - z[k - stride]);
    }
  }
  return { W, H, ns, nt, x, y, z };
}

/** Ponto da folha (s, t) na face da frente (side 1) ou de trás (-1). */
function filmPoint(f: Film, s: number, t: number, side: 1 | -1, out: THREE.Vector3) {
  const fi = clamp(((s + f.W / 2) / f.W) * f.ns, 0, f.ns - 1e-6);
  const fj = clamp((t / f.H) * f.nt, 0, f.nt - 1e-6);
  const i = Math.floor(fi);
  const j = Math.floor(fj);
  const a = fi - i;
  const b = fj - j;
  const stride = f.ns + 1;
  const k00 = j * stride + i;
  const k10 = k00 + 1;
  const k01 = k00 + stride;
  const k11 = k01 + 1;
  const pick = (arr: Float32Array) => (arr[k00] * (1 - a) + arr[k10] * a) * (1 - b) + (arr[k01] * (1 - a) + arr[k11] * a) * b;
  return out.set(pick(f.x), pick(f.y), side * pick(f.z));
}

/** Normal para fora da face (diferenças finitas sobre a folha). */
function filmNormal(f: Film, s: number, t: number, side: 1 | -1) {
  const e = 0.25;
  const du = filmPoint(f, s + e, t, side, new THREE.Vector3()).sub(filmPoint(f, s - e, t, side, new THREE.Vector3()));
  const dv = filmPoint(f, s, t + e, side, new THREE.Vector3()).sub(filmPoint(f, s, t - e, side, new THREE.Vector3()));
  const n = du.cross(dv);
  if (n.lengthSq() < 1e-10) n.set(0, 0, 1);
  n.normalize();
  if (n.z * side < 0) n.negate();
  return n;
}

/**
 * Recorte da alça vazada: oblongo de pontas redondas (~7,8 × 2,8 cm na 30 × 40), com a borda de cima levemente
 * arqueada e a de baixo subindo um tico no meio (apoio dos dedos). Contorno em cm da folha.
 */
function holeOutline(W: number, H: number): [number, number][] {
  const a = clamp(W * 0.13, 3, 5.2);
  const b = 1.4;
  const cy = H - clamp(H * 0.18, 4.5, 8);
  const L = a - b;
  const pts: [number, number][] = [];
  const edge = 24;
  const cap = 20;
  for (let k = 0; k <= edge; k += 1) {
    const x = -L + (2 * L * k) / edge;
    pts.push([x, cy + b + 0.12 * (1 - (x / L) ** 2)]);
  }
  for (let k = 1; k < cap; k += 1) {
    const th = Math.PI / 2 - (Math.PI * k) / cap;
    pts.push([L + b * Math.cos(th), cy + b * Math.sin(th)]);
  }
  for (let k = 0; k <= edge; k += 1) {
    const x = L - (2 * L * k) / edge;
    pts.push([x, cy - b + 0.3 * (1 - (x / L) ** 2)]);
  }
  for (let k = 1; k < cap; k += 1) {
    const th = -Math.PI / 2 - (Math.PI * k) / cap;
    pts.push([-L + b * Math.cos(th), cy + b * Math.sin(th)]);
  }
  return pts;
}

/** Posição (s) do eixo de cada perna da alça fita, a partir do centro. */
function loopAnchor(W: number) {
  return clamp(W * 0.17, 3.5, 7);
}

type FilmLook = { W: number; H: number; loop: boolean; base: string; dark: boolean };

/**
 * Detalhes no próprio filme (mapa de cor da folha inteira): soldas do fundo e das laterais e, conforme a alça, a borda do recorte ou a faixa dobrada da boca com a sua solda pontilhada.
 */
function paintFilm(ctx: CanvasRenderingContext2D, cw: number, ch: number, look: FilmLook) {
  const { W, H, loop, base, dark } = look;
  const px = cw / W;
  const X = (s: number) => (s / W + 0.5) * cw;
  const Y = (t: number) => (1 - t / H) * ch;
  const ink = (alpha: number) => (dark ? `rgba(255,255,255,${alpha})` : `rgba(40,40,46,${alpha})`);
  const band = (t0: number, t1: number, s0 = -W / 2, s1 = W / 2) => ctx.fillRect(X(s0), Y(t1), X(s1) - X(s0), Y(t0) - Y(t1));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, cw, ch);
  // Solda do fundo: faixa estreita com estrias da barra de solda; a saia abaixo fica um pouco mais densa.
  ctx.fillStyle = ink(0.03);
  band(0, BOTTOM_SEAL);
  ctx.fillStyle = ink(0.07);
  for (let s = -W / 2; s < W / 2; s += 0.16) band(BOTTOM_SEAL - 0.4, BOTTOM_SEAL - 0.1, s, s + 0.05);
  // Soldas laterais: filete junto à borda.
  ctx.fillStyle = ink(0.06);
  band(0, H, -W / 2 + 0.2, -W / 2 + 0.32);
  band(0, H, W / 2 - 0.32, W / 2 - 0.2);
  if (loop) {
    // Faixa dobrada para dentro e soldada (filme duplo, um pouco mais denso) e a solda pontilhada embaixo dela.
    ctx.fillStyle = ink(dark ? 0.025 : 0.04);
    band(H - BAND, H);
    ctx.fillStyle = ink(0.09);
    for (let s = -W / 2 + 0.4; s < W / 2 - 0.4; s += 0.42) band(H - BAND - 0.1, H - BAND + 0.1, s, s + 0.24);
  } else {
    // Borda do corte do recorte: o filme cortado pega um fio de luz.
    ctx.beginPath();
    holeOutline(W, H).forEach(([s, t], k) => (k ? ctx.lineTo(X(s), Y(t)) : ctx.moveTo(X(s), Y(t))));
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.16 * px;
    ctx.strokeStyle = ink(0.16);
    ctx.stroke();
  }
}

/** Mapa de cor do filme e máscara do recorte (alphaMap: preto = vazado). */
function useFilmTextures(look: FilmLook) {
  const { W, H, loop, base, dark } = look;
  const textures = useMemo(() => {
    const long = 1024;
    const cw = Math.round(W >= H ? long : (long * W) / H);
    const ch = Math.round(W >= H ? (long * H) / W : long);
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = cw;
    colorCanvas.height = ch;
    const ctx = colorCanvas.getContext("2d");
    if (ctx) paintFilm(ctx, cw, ch, { W, H, loop, base, dark });
    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = cw;
    alphaCanvas.height = ch;
    const actx = alphaCanvas.getContext("2d");
    if (actx) {
      actx.fillStyle = "#ffffff";
      actx.fillRect(0, 0, cw, ch);
      if (!loop) {
        actx.beginPath();
        holeOutline(W, H).forEach(([s, t], k) => {
          const x = (s / W + 0.5) * cw;
          const y = (1 - t / H) * ch;
          if (k) actx.lineTo(x, y);
          else actx.moveTo(x, y);
        });
        actx.closePath();
        actx.fillStyle = "#000000";
        actx.fill();
      }
    }
    const map = new THREE.CanvasTexture(colorCanvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const alpha = new THREE.CanvasTexture(alphaCanvas);
    alpha.anisotropy = 8;
    return { map, alpha };
  }, [W, H, loop, base, dark]);
  useEffect(
    () => () => {
      textures.map.dispose();
      textures.alpha.dispose();
    },
    [textures],
  );
  return textures;
}

function filmColors(spec: MockupSpec) {
  const details = spec.details ?? "";
  const dark = luma(spec.baseColor) < 0.12 || /\bpreta\b/.test(details);
  // PEAD branco é um branco leitoso, um pouco frio; o preto é quase puro e o brilho vem todo do reflexo.
  const base = dark ? "#151518" : spec.baseColor.toLowerCase() === "#ffffff" ? "#f8f8f5" : spec.baseColor;
  return { dark, base };
}

/**
 * Filme de PEAD brilhante: reflexo forte e nítido (o verniz natural do plástico soprado). O claro é leitoso e
 * deixa passar luz: um tico de emissão no lugar do espalhamento por dentro do filme, para não ficar cinza.
 */
function FilmMaterial({ map, alpha, color = "#ffffff", dark, side = THREE.FrontSide }: { map?: THREE.Texture; alpha?: THREE.Texture; color?: string; dark: boolean; side?: THREE.Side }) {
  return (
    <meshPhysicalMaterial
      map={map}
      alphaMap={alpha}
      alphaTest={alpha ? 0.5 : 0}
      color={color}
      side={side}
      roughness={dark ? 0.16 : 0.24}
      clearcoat={1}
      clearcoatRoughness={dark ? 0.06 : 0.12}
      envMapIntensity={dark ? 1.6 : 1}
      emissive={dark ? "#000000" : "#ffffff"}
      emissiveIntensity={dark ? 0 : 0.1}
    />
  );
}

/**
 * Sacola plástica plana de PEAD 0,15 mm (sem sanfona), em pé e quase plana, com o filme brilhante e vincado.
 * Alça vazada: o recorte oblongo na boca. Alça fixa (fita): faixa dobrada e soldada na boca e, em cada face, uma
 * alça em arco do mesmo filme (mesma cor da sacola), com as pontas soldadas por fora da faixa. Silk de 1 cor só
 * na frente, na área de 20 × 25 cm centralizada abaixo da alça.
 */
export function PlasticBag({ spec, art, label, showDims }: ModelProps) {
  const W = cm(spec.widthCm, 30, 12, 60);
  const H = cm(spec.heightCm, 40, 15, 80);
  const loop = /\balca fixa\b|\bfita\b/.test(spec.details ?? "");
  const { dark, base } = filmColors(spec);
  const pw = Math.min(BAG_PRINT[0], W * 0.72);
  const ph = Math.min(BAG_PRINT[1], H * 0.66);
  // Centro da área: entre a solda do fundo e a zona da alça (faixa da fita ou recorte).
  const holeBottom = Math.min(...holeOutline(W, H).map((p) => p[1]));
  const top = loop ? H - BAND - 1 : holeBottom - 1.2;
  const tc = clamp((BOTTOM_SEAL + top) / 2, BOTTOM_SEAL + ph / 2 + 0.5, Math.max(top - ph / 2, BOTTOM_SEAL + ph / 2 + 0.5));
  const rise = loop ? clamp(H * 0.25, 6, 12) : 0;

  const printArt = useApparelArt(art);
  const texture = useArtTexture(pw / ph, "front", printArt, label);
  const film = useFilmTextures({ W, H, loop, base, dark });

  const parts = useMemo(() => {
    const f = filmShape(W, H, loop);
    const stride = f.ns + 1;
    const face = (side: 1 | -1) =>
      gridGeometry({
        nu: f.ns,
        nv: f.nt,
        at: (i, j, out) => {
          const k = j * stride + i;
          out.set(f.x[k], f.y[k], side * f.z[k]);
        },
        uv: (i, j) => [i / f.ns, j / f.nt],
        outward: vec(0, 0, side),
      });
    const front = face(1);
    const back = face(-1);
    // Estampa: grade própria sobre a folha, afastada um fio na normal (acompanha os vincos).
    const cols = 60;
    const rows = 75;
    const print = gridGeometry({
      nu: cols,
      nv: rows,
      at: (i, j, out) => {
        const s = -pw / 2 + (pw * i) / cols;
        const t = tc - ph / 2 + (ph * j) / rows;
        filmPoint(f, s, t, 1, out).addScaledVector(filmNormal(f, s, t, 1), 0.035);
      },
      uv: (i, j) => [i / cols, j / rows],
      outward: AXIS_Z,
    });
    const straps: THREE.BufferGeometry[] = [];
    if (loop) {
      const x0 = loopAnchor(W);
      // Ponto por fora da face, afastado da folha pela espessura da fita.
      const outside = (s: number, t: number, side: 1 | -1) => filmPoint(f, s, t, side, new THREE.Vector3()).addScaledVector(filmNormal(f, s, t, side), 0.1);
      for (const side of [1, -1] as const) {
        const a0 = outside(-x0, H - 2.9, side);
        const a1 = outside(-x0, H - 0.6, side);
        const b1 = outside(x0, H - 0.6, side);
        const b0 = outside(x0, H - 2.9, side);
        const zt = (a1.z + b1.z) / 2;
        // As duas alças ficam em pé, abrindo um pouco para fora (cada uma presa na sua face).
        const lean = side * 0.7;
        const leg = (sx: number, k: number, up: number, out: number) => vec(sx * x0 * k, H + up, zt + lean * out);
        const pts = [
          a0,
          a1,
          leg(-1, 1, 1.6, 0.25),
          leg(-1, 0.99, rise - 2.8, 0.8),
          leg(-1, 0.7, rise - 0.35, 0.97),
          vec(0, H + rise, zt + lean),
          leg(1, 0.7, rise - 0.35, 0.97),
          leg(1, 0.99, rise - 2.8, 0.8),
          leg(1, 1, 1.6, 0.25),
          b1,
          b0,
        ];
        straps.push(strapGeometry(pts, STRAP_W, 0.07, AXIS_Z, 160));
      }
    }
    return { front, back, print, straps, all: [front, back, print, ...straps] };
  }, [W, H, loop, pw, ph, tc, rise]);
  useGeometriesCleanup(parts.all);

  const scale = TARGET / Math.max(W, H + rise);
  const inner = dark ? "#8d8d92" : "#d6d6d2";
  const [labelW, labelH] = sizeLabels(spec);

  return (
    <group>
      <group rotation-y={0.34}>
        <group scale={scale}>
          {[parts.front, parts.back].map((g, i) => (
            <group key={i}>
              <mesh geometry={g} castShadow receiveShadow>
                <FilmMaterial map={film.map} alpha={film.alpha} dark={dark} />
              </mesh>
              {/* Lado de dentro do filme: aparece pela boca e pelo recorte da alça. */}
              <mesh geometry={g}>
                <meshStandardMaterial color={inner} map={film.map} alphaMap={film.alpha} alphaTest={0.5} roughness={0.5} side={THREE.BackSide} />
              </mesh>
            </group>
          ))}
          <mesh geometry={parts.print}>
            <meshPhysicalMaterial
              map={texture}
              transparent
              alphaTest={0.02}
              roughness={0.3}
              clearcoat={0.8}
              clearcoatRoughness={0.08}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
          {parts.straps.map((g, i) => (
            <mesh key={i} geometry={g} castShadow>
              <FilmMaterial color={base} dark={dark} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      </group>
      {showDims && (
        <group position-y={(H * scale) / 2}>
          <Dimensions w={W * scale} h={H * scale} z={0.5} labelW={labelW} labelH={labelH} />
        </group>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------- saco de papel kraft

/** Pardo natural do kraft 80 g. */
const KRAFT = "#c8925a";
/** Lado do ladrilho da textura de fibra (cm). */
const FIBER_TILE = 12;

/** Papel kraft: cor parda com manchas largas da polpa, fibras curtas claras e escuras e pontinhos de impureza. */
function kraftCanvas() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const rand = seeded(17);
  ctx.fillStyle = KRAFT;
  ctx.fillRect(0, 0, size, size);
  // Repete o traço nas cópias vizinhas quando ele encosta na borda: o ladrilho emenda sem costura.
  const tiled = (x: number, y: number, reach: number, draw: (ox: number, oy: number) => void) => {
    for (const ox of [-size, 0, size]) {
      if (x + ox < -reach || x + ox > size + reach) continue;
      for (const oy of [-size, 0, size]) {
        if (y + oy < -reach || y + oy > size + reach) continue;
        draw(x + ox, y + oy);
      }
    }
  };
  for (let k = 0; k < 110; k += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 18 + rand() * 70;
    const alpha = 0.015 + rand() * 0.025;
    const color = rand() > 0.5 ? `rgba(236,206,162,${alpha})` : `rgba(112,72,36,${alpha})`;
    tiled(x, y, r, (cx, cy) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, color);
      g.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
  }
  for (let k = 0; k < 2800; k += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI;
    const l = 3 + rand() * 13;
    const bend = (rand() - 0.5) * l * 0.5;
    ctx.strokeStyle = rand() > 0.45 ? `rgba(92,58,26,${0.07 + rand() * 0.12})` : `rgba(242,216,172,${0.08 + rand() * 0.14})`;
    ctx.lineWidth = 0.6 + rand() * 0.9;
    tiled(x, y, l, (cx, cy) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + Math.cos(a) * l * 0.5 - Math.sin(a) * bend, cy + Math.sin(a) * l * 0.5 + Math.cos(a) * bend, cx + Math.cos(a) * l, cy + Math.sin(a) * l);
      ctx.stroke();
    });
  }
  for (let k = 0; k < 150; k += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.4 + rand() * 1.1;
    ctx.fillStyle = `rgba(64,38,16,${0.18 + rand() * 0.25})`;
    tiled(x, y, r, (cx, cy) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return canvas;
}

/** Textura do kraft em repetição por centímetro (as UVs do saco estão em cm). */
function useKraftPaper() {
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(kraftCanvas());
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.repeat.set(1 / FIBER_TILE, 1 / FIBER_TILE);
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Área de impressão do tamanho escolhido ("area de impressao 19x12 cm"); sem ela, a do tamanho mais próximo. */
function kraftPrintArea(spec: MockupSpec, W: number, H: number): [number, number] {
  const found = /area de impressao (\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/.exec(spec.details ?? "");
  const num = (v: string) => Number(v.replace(",", "."));
  let [pw, ph] = found ? [num(found[1]), num(found[2])] : W <= 21 ? [12, 8] : W <= 28 ? [19, 12] : [22, 18];
  if (!Number.isFinite(pw) || pw <= 0) pw = W * 0.7;
  if (!Number.isFinite(ph) || ph <= 0) ph = H * 0.4;
  return [Math.min(pw, W * 0.9), Math.min(ph, H * 0.8)];
}

type Sack = { W: number; H: number; D: number };

/** Recuo do vinco central do fole na altura y (o fole tende a voltar a fechar perto da boca). */
function gussetFold(k: Sack, y: number) {
  return k.D * 0.26 * smooth(y, k.D / 2, k.H) ** 1.15;
}

/** Altura do vinco horizontal da dobra do fundo: o saco vem dobrado chato e o fundo fica marcado no corpo. */
function foldLine(k: Sack) {
  return Math.min(k.D * 0.95, k.H * 0.4);
}

/**
 * Relevo do papel (cm, para fora da parede): o vinco em V da dobra do fundo, a ondulação leve do kraft amassado e
 * rugas verticais perto da boca (o papel fino cede onde não há fundo nem fole para segurar). `phase` varia por face.
 */
function paperRelief(k: Sack, s: number, y: number, phase: number) {
  const crease = -0.2 * Math.max(0, 1 - Math.abs(y - foldLine(k)) / 0.45);
  const crumple = 0.06 * Math.sin(s * 0.53 + y * 0.29 + phase) * Math.sin(y * 0.41 - s * 0.37 + phase * 2) + 0.025 * Math.sin(s * 1.13 - y * 0.71 + phase * 1.7) * Math.sin(y * 0.23 + phase);
  const mouth = smooth(y, k.H * 0.55, k.H) * (0.1 * Math.sin(s * 1.25 + phase * 3) + 0.06 * Math.sin(s * 2.9 + y * 0.2 + phase));
  return crease + crumple + mouth;
}

/** |z| das quinas entre a frente e o fole: o fole recuado puxa as quinas para o meio. */
function cornerDepth(k: Sack, y: number) {
  const half = k.D / 2;
  const c = gussetFold(k, y);
  return Math.sqrt(Math.max(half * half - c * c, 0.01));
}

/** Ponto da frente (s em cm a partir do centro, y em cm): a boca arredonda e o painel tem uma barriga leve. */
function sackFront(k: Sack, s: number, y: number, out: THREE.Vector3) {
  const e = 1 - (2 * s / k.W) ** 2;
  const corner = cornerDepth(k, y);
  const bow = 0.2 * Math.sin(Math.PI * clamp(y / k.H, 0, 1)) + 0.12 * smooth(y, k.H * 0.6, k.H);
  // O relevo some nas quinas (encontro com o fole) para as paredes continuarem emendadas.
  return out.set(s, y, corner + (k.D / 2 - corner) * e * 1.08 + bow * e + paperRelief(k, s, y, 0.7) * Math.min(1, e * 5));
}

/** Meia-face do fole: u = 0 na quina, 1 no vinco central; sx = lado (±x), hz = metade da frente (+) ou das costas (-). */
function sackGusset(k: Sack, u: number, y: number, sx: number, hz: number, out: THREE.Vector3) {
  const half = k.D / 2;
  // Triângulo do fundo SOS (abaixo da diagonal que sobe da quina até o vinco): fica um pouco para dentro,
  // com o vinco da diagonal marcado.
  const below = u * half - y;
  const dent = below > 0 ? 0.7 * (1 - Math.exp(-below / 1.2)) * smooth(y, 0, 1.4) : 0;
  // Relevo do papel (o vinco da dobra do fundo continua pelo fole), nulo na quina e no vinco central.
  const relief = 0.7 * paperRelief(k, (u - 0.5) * half, y, sx > 0 ? 2.1 : 3.4) * Math.sin(Math.PI * u);
  return out.set(sx * (k.W / 2 - gussetFold(k, y) * u - dent + relief), y, hz * cornerDepth(k, y) * (1 - u));
}

/** Serrilha da boca: altura do topo na coluna i (picos e vales alternados). */
const TOOTH = 0.3;
const PITCH = 0.62;

function teeth(length: number) {
  return Math.max(2, 2 * Math.round(length / PITCH));
}

function sackParts(k: Sack, pw: number, ph: number, yc: number, twoSides: boolean) {
  const { W, H, D } = k;
  const half = D / 2;
  const rows = Math.ceil((H - TOOTH) / 0.32);
  const yOf = (i: number, j: number) => (j <= rows ? (j / rows) * (H - TOOTH) : H - (i % 2 ? TOOTH : 0));
  // Por dentro: escurece com a profundidade (pouca luz chega ao fundo do saco).
  const tone = (y: number) => lerp(0.42, 0.93, smooth(y / H, 0, 1) ** 0.75);
  const p = new THREE.Vector3();

  const nf = teeth(W);
  const panel = (sideZ: 1 | -1) =>
    gridGeometry({
      nu: nf,
      nv: rows + 1,
      at: (i, j, out) => {
        sackFront(k, -W / 2 + (W * i) / nf, yOf(i, j), out);
        out.z *= sideZ;
      },
      uv: (i, j) => [(W * i) / nf + (sideZ > 0 ? 0 : W + D), yOf(i, j)],
      outward: vec(0, 0, sideZ),
      tone: (i, j) => tone(yOf(i, j)),
    });
  const front = panel(1);
  const back = panel(-1);

  const ng = teeth(half);
  const gussets: THREE.BufferGeometry[] = [];
  for (const sx of [1, -1]) {
    for (const hz of [1, -1]) {
      gussets.push(
        gridGeometry({
          nu: ng,
          nv: rows + 1,
          at: (i, j, out) => sackGusset(k, i / ng, yOf(i, j), sx, hz, out),
          uv: (i, j) => [W + (hz > 0 ? 0 : half) + (half * i) / ng + (sx > 0 ? 0 : 2 * W + D), yOf(i, j)],
          outward: vec(sx, 0, 0),
          tone: (i, j) => tone(yOf(i, j)),
        }),
      );
    }
  }

  const bottom = gridGeometry({ nu: 2, nv: 2, at: (i, j, out) => out.set((i / 2 - 0.5) * W, 0, (j / 2 - 0.5) * D), uv: (i, j) => [(i / 2) * W, (j / 2) * D], outward: vec(0, -1, 0) });
  // Fundo visto por dentro, com as abas dobradas do fundo SOS (duas faixas sobrepostas).
  const floor = gridGeometry({ nu: 2, nv: 2, at: (i, j, out) => out.set((i / 2 - 0.5) * (W - 0.1), 0.04, (j / 2 - 0.5) * (D - 0.1)), uv: (i, j) => [(i / 2) * W, (j / 2) * D], outward: AXIS_Y });
  const flaps = [0.55, -0.45].map((zc, n) =>
    gridGeometry({
      nu: 2,
      nv: 2,
      at: (i, j, out) => out.set((i / 2 - 0.5) * (W - 0.4), 0.07 + n * 0.02, (zc + (j / 2 - 0.5) * 0.62) * half),
      uv: (i, j) => [(i / 2) * W + 3, (j / 2) * half],
      outward: AXIS_Y,
    }),
  );

  // Emenda colada das costas (sobreposição de papel), fora do centro.
  const s0 = W * 0.16;
  const lap = gridGeometry({
    nu: 3,
    nv: rows,
    at: (i, j, out) => {
      const s = s0 + (1.6 * i) / 3;
      sackFront(k, s, (j / rows) * (H - TOOTH - 0.1), out);
      out.z = -out.z - 0.025;
    },
    uv: (i, j) => [(1.6 * i) / 3 + 5, (j / rows) * H],
    outward: vec(0, 0, -1),
  });

  // Estampas: grade sobre a frente (e as costas, em 2 lados), afastada um fio na normal.
  const cols = 32;
  const prow = 24;
  const art = (sideZ: 1 | -1) =>
    gridGeometry({
      nu: cols,
      nv: prow,
      at: (i, j, out) => {
        // Nas costas a arte começa no +x (vista de trás, a esquerda de quem olha).
        const s = sideZ * (-pw / 2 + (pw * i) / cols);
        const y = yc - ph / 2 + (ph * j) / prow;
        sackFront(k, s, y, out);
        const n = sackFront(k, s + 0.2, y, p.clone()).sub(sackFront(k, s - 0.2, y, new THREE.Vector3())).cross(sackFront(k, s, y + 0.2, new THREE.Vector3()).sub(sackFront(k, s, y - 0.2, new THREE.Vector3()))).normalize();
        out.addScaledVector(n, 0.03);
        out.z *= sideZ;
      },
      uv: (i, j) => [i / cols, j / prow],
      outward: vec(0, 0, sideZ),
    });
  const prints = twoSides ? [art(1), art(-1)] : [art(1)];

  const walls = [front, back, ...gussets];
  return { walls, bottom, floor, flaps, lap, prints, all: [...walls, bottom, floor, ...flaps, lap, ...prints] };
}

/**
 * Tinta do silk sobre o papel pardo: multiplica a cor do kraft já iluminado (tinta translúcida sobre papel).
 * Saída pré-multiplicada: cor = papel × (1 − α + α · tinta).
 */
function MultiplyInk({ map }: { map: THREE.Texture }) {
  return (
    <meshBasicMaterial
      map={map}
      transparent
      premultipliedAlpha
      blending={THREE.CustomBlending}
      blendEquation={THREE.AddEquation}
      blendSrc={THREE.DstColorFactor}
      blendDst={THREE.OneMinusSrcAlphaFactor}
      depthWrite={false}
      toneMapped={false}
      polygonOffset
      polygonOffsetFactor={-2}
      polygonOffsetUnits={-2}
    />
  );
}

/**
 * Saco de papel kraft pardo 80 g, sem alça, aberto e em pé: fole lateral com vinco central, fundo quadrado
 * (SOS), boca com picote serrilhado e emenda colada nas costas. Silk de 1 ou 2 cores na área fixa do tamanho
 * (P 12 × 8, M 19 × 12, G 22 × 18 cm), centralizada na frente; em "frente e verso", também nas costas.
 */
export function KraftSack({ spec, art, label, showDims }: ModelProps) {
  const W = cm(spec.widthCm, 26, 10, 60);
  const H = cm(spec.heightCm, 31, 12, 70);
  const D = clamp(cm(spec.depthCm, 10, 3, 30), 3, W * 0.7);
  const [pw, ph] = kraftPrintArea(spec, W, H);
  const yc = clamp(H * 0.47, ph / 2 + 1.5, H - ph / 2 - 2);
  const twoSides = backVariant(spec) !== "blank" || /\bfrente e verso\b|\b2 lados\b/.test(spec.details ?? "");

  // A arte do silk sai sem fundo e o template escolhe tinta que contrasta com o pardo.
  const apparel = useApparelArt(art);
  const printArt = useMemo(() => ({ ...apparel, surface: KRAFT }), [apparel]);
  const texture = useArtTexture(pw / ph, "front", printArt, label);
  const paper = useKraftPaper();

  const parts = useMemo(() => sackParts({ W, H, D }, pw, ph, yc, twoSides), [W, H, D, pw, ph, yc, twoSides]);
  useGeometriesCleanup(parts.all);

  const scale = TARGET / Math.max(W, H);
  const [labelW, labelH] = sizeLabels(spec);

  return (
    <group>
      <group rotation-y={-0.45}>
        <group scale={scale}>
          {parts.walls.map((g, i) => (
            <group key={i}>
              <mesh geometry={g} castShadow receiveShadow>
                <meshStandardMaterial map={paper} roughness={0.9} bumpMap={paper} bumpScale={0.6} />
              </mesh>
              <mesh geometry={g}>
                <meshStandardMaterial map={paper} color="#e9e2d8" vertexColors roughness={0.95} side={THREE.BackSide} />
              </mesh>
            </group>
          ))}
          <mesh geometry={parts.bottom}>
            <meshStandardMaterial map={paper} roughness={0.9} />
          </mesh>
          <mesh geometry={parts.floor}>
            <meshStandardMaterial map={paper} color="#5e5953" roughness={0.95} />
          </mesh>
          {parts.flaps.map((g, i) => (
            <mesh key={i} geometry={g}>
              <meshStandardMaterial map={paper} color={i ? "#625b53" : "#6c655c"} roughness={0.95} />
            </mesh>
          ))}
          <mesh geometry={parts.lap}>
            <meshStandardMaterial map={paper} color="#efe6da" roughness={0.9} bumpMap={paper} bumpScale={0.6} />
          </mesh>
          {parts.prints.map((g, i) => (
            <mesh key={i} geometry={g}>
              <MultiplyInk map={texture} />
            </mesh>
          ))}
        </group>
      </group>
      {showDims && (
        <group position-y={(H * scale) / 2}>
          <Dimensions w={W * scale} h={H * scale} z={0.6} labelW={labelW} labelH={labelH} />
        </group>
      )}
    </group>
  );
}
