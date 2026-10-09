"use client";

// Embalagens dos produtos novos em papel cartão e micro-ondulado, em centímetros reais dentro de um grupo com
// escala própria (cm → unidades de cena), frente para +z e apoiadas no chão em y = 0. A construção segue as fotos
// do produto montado:
// - PanettoneBox: caixa de panetone de base quadrada. "Reta": tronco de pirâmide (mais larga embaixo), topo plano e
//   alça de cartão em pé no meio do topo (aba dupla com recorte de pega). "Chanfrada": paredes retas até a metade;
//   daí as laterais se curvam para dentro até o topo estreito, e a frente e o verso, cortados em arco (o chanfro),
//   deixam uma fresta em lente entre eles e as laterais;
// - BasketBox: cesta aberta de micro-ondulado onda E com as paredes abertas para fora. Cada parede é folha dupla (a
//   folha dobra na borda de cima e desce por dentro, impressa dos dois lados), as menores têm as orelhas de
//   travamento nos cantos e o recorte de pega. Dentro, papel de seda amassado, pães e um ovo de chocolate.

import { useMemo } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO } from "@/lib/mockup-kinds";
import { Dimensions, PrintMaterial, makeShape, roughnessOf, sizeLabels, useArtTexture, type ModelProps } from "./shared";
import { useGeometriesCleanup } from "./fabric";
import { lathe, type Pt } from "./vessel";

/** Folga (cm) entre a superfície e o plano da arte, contra z-fighting. */
const LIFT = 0.02;

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smoothstep = THREE.MathUtils.smoothstep;

/** Medida em cm válida: o spec pode vir sem medida, com zero ou NaN. */
function cm(value: number, fallback: number, min: number) {
  return Number.isFinite(value) && value > 0 ? Math.max(value, min) : fallback;
}

/** Gerador pseudoaleatório determinístico (mulberry32): a peça sai igual a cada render. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------------------------------------
 * Papel e materiais
 * ---------------------------------------------------------------------------------------------- */

const KRAFT = "#c69c6d";

type Board = {
  /** Cor do papel de base que escurece a tinta (kraft, reciclado); null = cartão ou couché branco. */
  tint: string | null;
  /** Miolo do papel visto no corte. */
  core: string;
};

/** Papel da face externa pelo texto das opções ("kraft 240g", "reciclato 300g"…); o interior não conta. */
function boardOf(spec: MockupSpec): Board {
  const outer = (spec.details ?? "").replace(/\binterior \w+/g, "");
  if (/\bkraft\b/.test(outer)) return { tint: "#d8b78e", core: KRAFT };
  if (/\breciclat/.test(outer)) return { tint: "#ece6d8", core: "#ddd6c6" };
  return { tint: null, core: "#f4f2ec" };
}

/** Cor do papel impresso fora da arte: o fundo da arte (transparente = papel), multiplicado pelo papel de base. */
function printedPaper(background: string, board: Board) {
  const clear = background === "transparent" || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(background);
  const color = new THREE.Color(clear ? "#ffffff" : background);
  if (board.tint) color.multiply(new THREE.Color(board.tint));
  return `#${color.getHexString()}`;
}

/** Papel impresso fora da arte, com o acabamento da laminação. */
function Coated({ color, spec, attach }: { color: string; spec: MockupSpec; attach?: string }) {
  const roughness = roughnessOf(spec);
  if (spec.clearcoat > 0) return <meshPhysicalMaterial attach={attach} color={color} roughness={roughness} clearcoat={spec.clearcoat} clearcoatRoughness={0.08} />;
  return <meshStandardMaterial attach={attach} color={color} roughness={roughness} />;
}

/** Arte impressa; em kraft ou reciclado a tinta escurece com o papel (multiplica pela cor dele) e fica fosca. */
function Ink({ map, spec, tint }: { map: THREE.Texture; spec: MockupSpec; tint: string | null }) {
  if (!tint) return <PrintMaterial map={map} spec={spec} />;
  return <meshStandardMaterial map={map} color={tint} roughness={0.88} />;
}

/** Cota em volta da peça (a caixa não mostra cotas hoje; segue o padrão dos vizinhos). */
function SizeGuide({ spec, w, h, z }: { spec: MockupSpec; w: number; h: number; z: number }) {
  const [lw, lh] = sizeLabels(spec);
  return (
    <group position-y={h / 2}>
      <Dimensions w={w} h={h} z={z} labelW={lw} labelH={lh} />
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Malhas
 * ---------------------------------------------------------------------------------------------- */

type Vertex = { p: THREE.Vector3; n: THREE.Vector3; uv: [number, number] };

/**
 * Malha em grade de (nu + 1) × (nv + 1) pontos dados por vertex(i, j). A ordem dos triângulos segue a normal
 * informada (conferida numa célula do meio), então quem chama não precisa pensar no sentido.
 */
function gridGeometry(nu: number, nv: number, vertex: (i: number, j: number) => Vertex) {
  const cols = nu + 1;
  const count = cols * (nv + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) {
      const k = j * cols + i;
      const q = vertex(i, j);
      positions.set([q.p.x, q.p.y, q.p.z], k * 3);
      normals.set([q.n.x, q.n.y, q.n.z], k * 3);
      uvs.set(q.uv, k * 2);
    }
  }
  const at = (k: number) => new THREE.Vector3().fromArray(positions, k * 3);
  const probe = Math.floor(nv / 2) * cols + Math.floor(nu / 2);
  const face = at(probe + 1).sub(at(probe)).cross(at(probe + cols).sub(at(probe)));
  const flip = face.dot(new THREE.Vector3().fromArray(normals, probe * 3)) < 0;
  const indices: number[] = [];
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (flip) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

type RingPoint = { x: number; z: number; nx: number; nz: number };

/**
 * Contorno de retângulo de cantos arredondados no plano xz (largura w, profundidade d, raio r): começa no canto
 * esquerdo da frente e anda para +x (frente → direita → trás → esquerda), fechando no primeiro ponto. A contagem
 * por trecho é fixa, então contornos de tamanhos diferentes (base e topo do tronco) ficam alinhados ponto a ponto.
 */
function ringPoints(w: number, d: number, r: number, arc = 8): RingPoint[] {
  const rr = clamp(r, 0.02, Math.min(w, d) / 2 - 0.02);
  const hx = w / 2 - rr;
  const hz = d / 2 - rr;
  const points: RingPoint[] = [];
  // Começo de cada reta [x, z, nx, nz] e o canto que vem depois dela [centro x, centro z, ângulo inicial da normal].
  const straights: [number, number, number, number][] = [
    [-hx, d / 2, 0, 1],
    [w / 2, hz, 1, 0],
    [hx, -d / 2, 0, -1],
    [-w / 2, -hz, -1, 0],
  ];
  const corners: [number, number, number][] = [
    [hx, hz, Math.PI / 2],
    [hx, -hz, 0],
    [-hx, -hz, -Math.PI / 2],
    [-hx, hz, -Math.PI],
  ];
  straights.forEach(([x, z, nx, nz], k) => {
    points.push({ x, z, nx, nz });
    const [cx, cz, a0] = corners[k];
    for (let i = 0; i <= arc; i += 1) {
      const a = a0 - (Math.PI / 2) * (i / arc);
      points.push({ x: cx + rr * Math.cos(a), z: cz + rr * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) });
    }
  });
  points.push({ ...points[0] });
  return points;
}

/** Normal da parede entre dois contornos alinhados (o de baixo em y = 0, o de cima em y = h). */
function wallNormal(lo: RingPoint, hi: RingPoint, h: number) {
  const lean = (hi.x - lo.x) * lo.nx + (hi.z - lo.z) * lo.nz;
  return new THREE.Vector3(lo.nx * h, -lean, lo.nz * h).normalize();
}

/** Retângulo de cantos arredondados (furo de pega, recorte da alça) desenhado num Path, centro (cx, cy). */
function roundedRectPath(w: number, h: number, r: number, cx: number, cy: number) {
  const path = new THREE.Path();
  const rr = Math.min(r, w / 2, h / 2);
  const x = cx - w / 2;
  const y = cy - h / 2;
  path.moveTo(x + rr, y);
  path.lineTo(x + w - rr, y);
  path.quadraticCurveTo(x + w, y, x + w, y + rr);
  path.lineTo(x + w, y + h - rr);
  path.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  path.lineTo(x + rr, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - rr);
  path.lineTo(x, y + rr);
  path.quadraticCurveTo(x, y, x + rr, y);
  return path;
}

/** Separa uma geometria não indexada em uma geometria por grupo (cada uma com um material simples). */
function splitGroups(source: THREE.BufferGeometry) {
  const names = ["position", "normal", "uv"] as const;
  const parts = source.groups.map(({ start, count }) => {
    const geometry = new THREE.BufferGeometry();
    for (const name of names) {
      const attribute = source.getAttribute(name);
      const size = attribute.itemSize;
      geometry.setAttribute(name, new THREE.BufferAttribute((attribute.array as Float32Array).slice(start * size, (start + count) * size), size));
    }
    return geometry;
  });
  source.dispose();
  return parts;
}

/* ------------------------------------------------------------------------------------------------
 * Caixa de panetone
 * ---------------------------------------------------------------------------------------------- */

/** Raio do vinco das arestas verticais da caixa reta (cartão 300 g). */
const CREASE = 0.14;
/** Espessura da alça: duas folhas de cartão 300 g coladas costas com costas (cm). */
const HANDLE_T = 0.11;
/** Verso do cartão (sem impressão), na sombra de dentro da caixa. */
const INSIDE = "#cdc9c0";

type PanettoneDims = {
  chamfer: boolean;
  W: number;
  D: number;
  /** Altura da caixa (sem a alça, como na cota do produto). */
  H: number;
  /** Quanto cada parede da reta entra no topo (tronco de pirâmide). */
  lean: number;
  /** Alça da reta: largura e altura acima do topo. */
  handleW: number;
  handleH: number;
  /** Chanfrada: altura das paredes retas, largura do topo, raio do arco das laterais, ângulo final e folga da lente. */
  h0: number;
  topW: number;
  R: number;
  theta: number;
  lens: number;
  /** Proporção da arte da frente e da lateral. */
  frontAspect: number;
  sideAspect: number;
};

/** Medidas da caixa montada (L x A x P). Proporções da reta e do chanfro tiradas das fotos do produto. */
function panettoneDims(W: number, H: number, D: number, chamfer: boolean): PanettoneDims {
  if (!chamfer) {
    const lean = H * 0.075;
    const slant = Math.hypot(H, lean);
    return {
      chamfer,
      W,
      D,
      H,
      lean,
      handleW: (W - 2 * lean) * 0.68,
      handleH: clamp(H * 0.29, 2.5, 6),
      h0: H,
      topW: W - 2 * lean,
      R: 0,
      theta: 0,
      lens: 0,
      frontAspect: (W - 2 * CREASE) / slant,
      sideAspect: (D - 2 * CREASE) / slant,
    };
  }
  // Laterais: retas até pouco mais da metade e depois um arco de círculo que sai na vertical e fecha no topo.
  const h0 = H * 0.52;
  const topW = W * 0.56;
  const inset = (W - topW) / 2;
  const rise = H - h0;
  const R = (rise * rise + inset * inset) / (2 * inset);
  const theta = Math.asin(clamp(rise / R, 0, 1));
  return {
    chamfer,
    W,
    D,
    H,
    lean: 0,
    handleW: 0,
    handleH: 0,
    h0,
    topW,
    R,
    theta,
    lens: W * 0.12,
    frontAspect: W / H,
    sideAspect: D / (h0 + R * theta),
  };
}

/** Modelo pelo Formato ("reta"/"chanfrada"); sem ele, caixa bem mais alta que larga é chanfrada. */
function isChamfer(spec: MockupSpec, W: number, H: number, D: number) {
  const text = spec.details ?? "";
  return /\bchanfrad/.test(text) || (!/\breta\b/.test(text) && H > Math.max(W, D) * 1.25);
}

/**
 * Face impressa de uma parede trapezoidal plana, vista de fora e afastada `LIFT` dela. A arte tem a largura de
 * baixo (a maior) e é aparada nas laterais em cima, como no gabarito: não distorce.
 */
function trapezoidFace(nx: number, nz: number, dBottom: number, dTop: number, halfBottom: number, halfTop: number, height: number) {
  const rx = nz;
  const rz = -nx;
  const normal = new THREE.Vector3(nx * height, dBottom - dTop, nz * height).normalize();
  return gridGeometry(1, 1, (i, j) => {
    const side = i ? 1 : -1;
    const d = j ? dTop : dBottom;
    const half = j ? halfTop : halfBottom;
    const p = new THREE.Vector3(nx * d + rx * side * half, j * height, nz * d + rz * side * half).addScaledVector(normal, LIFT);
    return { p, n: normal, uv: [0.5 + (side * half) / (2 * halfBottom), j] };
  });
}

/** Alça da reta vista de frente (plano xy, base em y = 0): retângulo de cantos de cima arredondados e o recorte de pega embaixo. */
function handleShape(width: number, height: number) {
  const half = width / 2;
  const r = Math.min(0.6, height * 0.16);
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half, height - r);
  shape.quadraticCurveTo(half, height, half - r, height);
  shape.lineTo(-half + r, height);
  shape.quadraticCurveTo(-half, height, -half, height - r);
  shape.lineTo(-half, 0);
  // Recorte de pega: largo e baixo, quase encostado no topo da caixa (fica uma faixa grossa em cima).
  const y0 = height * 0.14;
  const y1 = height * 0.58;
  shape.holes.push(roundedRectPath(width * 0.64, y1 - y0, Math.min(0.45, (y1 - y0) * 0.35), 0, (y0 + y1) / 2));
  return shape;
}

/** Caixa reta: casca em tronco de pirâmide de cantos vincados, faces da arte, topo, fundo e a alça em pé. */
function retaParts({ W, D, H, lean, handleW, handleH }: PanettoneDims) {
  const Wt = W - 2 * lean;
  const Dt = D - 2 * lean;
  const lo = ringPoints(W, D, CREASE);
  const hi = ringPoints(Wt, Dt, CREASE);
  const normals = lo.map((q, i) => wallNormal(q, hi[i], H));
  const shell = gridGeometry(lo.length - 1, 1, (i, j) => {
    const q = j ? hi[i] : lo[i];
    return { p: new THREE.Vector3(q.x, j * H, q.z), n: normals[i], uv: [0, j] };
  });
  const flatW = (w: number) => w / 2 - CREASE;
  const faces = [
    { geometry: trapezoidFace(0, 1, D / 2, Dt / 2, flatW(W), flatW(Wt), H), along: true },
    { geometry: trapezoidFace(1, 0, W / 2, Wt / 2, flatW(D), flatW(Dt), H), along: false },
    { geometry: trapezoidFace(0, -1, D / 2, Dt / 2, flatW(W), flatW(Wt), H), along: true },
    { geometry: trapezoidFace(-1, 0, W / 2, Wt / 2, flatW(D), flatW(Dt), H), along: false },
  ];
  const top = new THREE.ShapeGeometry(makeShape("rect", Wt, Dt, CREASE), 6);
  top.rotateX(-Math.PI / 2);
  top.translate(0, H, 0);
  const bottom = new THREE.ShapeGeometry(makeShape("rect", W, D, CREASE), 6);
  bottom.rotateX(Math.PI / 2);
  const handle = new THREE.ExtrudeGeometry(handleShape(handleW, handleH), { depth: HANDLE_T, bevelEnabled: false, curveSegments: 10 });
  handle.translate(0, H, -HANDLE_T / 2);
  return { shell, faces, top, bottom, handle, all: [shell, ...faces.map((f) => f.geometry), top, bottom, handle] };
}

/**
 * Caixa chanfrada: frente e verso planos cortados em arco (retos até h0 e depois o chanfro, um pouco mais fundo que
 * a curva das laterais, o que abre a lente), laterais que sobem retas e se curvam para dentro até o topo estreito e
 * o topo plano. A arte cobre frente, verso e laterais (medida ao longo da curva, sem esticar).
 */
function chanfradaParts({ W, D, H, h0, topW, R, theta, lens }: PanettoneDims) {
  // Perfil da lateral direita (x ≥ 0) com normal e comprimento acumulado.
  const steps = 28;
  const profile: { x: number; y: number; nx: number; ny: number; s: number }[] = [
    { x: W / 2, y: 0, nx: 1, ny: 0, s: 0 },
    { x: W / 2, y: h0, nx: 1, ny: 0, s: h0 },
  ];
  for (let i = 1; i <= steps; i += 1) {
    const a = (theta * i) / steps;
    profile.push({ x: W / 2 - R * (1 - Math.cos(a)), y: h0 + R * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a), s: h0 + R * a });
  }
  const length = profile[profile.length - 1].s;
  const lateral = (sign: number) =>
    gridGeometry(profile.length - 1, 1, (i, j) => {
      const q = profile[i];
      // Direita de quem olha a lateral de fora: −z na lateral direita, +z na esquerda.
      const z = (sign > 0 ? 1 - 2 * j : 2 * j - 1) * (D / 2);
      return { p: new THREE.Vector3(sign * q.x, q.y, z), n: new THREE.Vector3(sign * q.nx, q.ny, 0), uv: [0.5 - (sign * z) / D, q.s / length] };
    });

  // Meia largura da frente na altura y: a curva da lateral menos a lente (zero nas pontas do chanfro).
  const half = (y: number) => {
    if (y <= h0) return W / 2;
    const dy = y - h0;
    return W / 2 - (R - Math.sqrt(Math.max(R * R - dy * dy, 0))) - lens * Math.sin(Math.PI * clamp(dy / (H - h0), 0, 1));
  };
  const outline = new THREE.Shape();
  outline.moveTo(-W / 2, 0);
  outline.lineTo(W / 2, 0);
  outline.lineTo(W / 2, h0);
  for (let i = 1; i <= steps; i += 1) {
    const y = lerp(h0, H, i / steps);
    outline.lineTo(i === steps ? topW / 2 : half(y), y);
  }
  for (let i = steps; i >= 1; i -= 1) {
    const y = lerp(h0, H, i / steps);
    outline.lineTo(i === steps ? -topW / 2 : -half(y), y);
  }
  outline.lineTo(-W / 2, h0);
  outline.lineTo(-W / 2, 0);
  const panel = new THREE.ShapeGeometry(outline);
  const p = panel.getAttribute("position");
  const uv = panel.getAttribute("uv");
  for (let i = 0; i < p.count; i += 1) uv.setXY(i, p.getX(i) / W + 0.5, p.getY(i) / H);
  const front = panel.clone().translate(0, 0, D / 2);
  const back = panel.clone().rotateY(Math.PI).translate(0, 0, -D / 2);
  panel.dispose();

  const lid = new THREE.ShapeGeometry(makeShape("rect", topW, D, 0.02), 1);
  lid.rotateX(-Math.PI / 2);
  lid.translate(0, H, 0);
  const bottom = new THREE.ShapeGeometry(makeShape("rect", W, D, 0.02), 1);
  bottom.rotateX(Math.PI / 2);
  const sides = [lateral(1), lateral(-1)];
  return { front, back, sides, lid, bottom, all: [front, back, ...sides, lid, bottom] };
}

type PanettoneView = { dims: PanettoneDims; front: THREE.Texture; side: THREE.Texture; paper: string; board: Board; spec: MockupSpec };

function PanettoneReta({ dims, front, side, paper, board, spec }: PanettoneView) {
  const parts = useMemo(() => retaParts(dims), [dims]);
  useGeometriesCleanup(parts.all);
  return (
    <>
      <mesh geometry={parts.shell} castShadow receiveShadow>
        <Coated color={paper} spec={spec} />
      </mesh>
      {parts.faces.map(({ geometry, along }, i) => (
        <mesh key={i} geometry={geometry} receiveShadow>
          <Ink map={along ? front : side} spec={spec} tint={board.tint} />
        </mesh>
      ))}
      <mesh geometry={parts.top} castShadow receiveShadow>
        <Coated color={paper} spec={spec} />
      </mesh>
      <mesh geometry={parts.bottom}>
        <Coated color={paper} spec={spec} />
      </mesh>
      <mesh geometry={parts.handle} castShadow receiveShadow>
        <Coated attach="material-0" color={paper} spec={spec} />
        <meshStandardMaterial attach="material-1" color={board.core} roughness={0.9} />
      </mesh>
    </>
  );
}

function PanettoneChanfrada({ dims, front, side, paper, board, spec }: PanettoneView) {
  const parts = useMemo(() => chanfradaParts(dims), [dims]);
  useGeometriesCleanup(parts.all);
  const inside = <meshStandardMaterial color={INSIDE} roughness={0.9} side={THREE.BackSide} />;
  return (
    <>
      {[parts.front, parts.back].map((geometry, i) => (
        <group key={i}>
          <mesh geometry={geometry} castShadow receiveShadow>
            <Ink map={front} spec={spec} tint={board.tint} />
          </mesh>
          <mesh geometry={geometry}>{inside}</mesh>
        </group>
      ))}
      {parts.sides.map((geometry, i) => (
        <group key={i}>
          <mesh geometry={geometry} castShadow receiveShadow>
            <Ink map={side} spec={spec} tint={board.tint} />
          </mesh>
          <mesh geometry={geometry}>{inside}</mesh>
        </group>
      ))}
      <mesh geometry={parts.lid} castShadow receiveShadow>
        <Coated color={paper} spec={spec} />
      </mesh>
      <mesh geometry={parts.lid}>{inside}</mesh>
      <mesh geometry={parts.bottom}>
        <Coated color={paper} spec={spec} />
      </mesh>
    </>
  );
}

/** Embalagem para panetone (reta com alça ou chanfrada), arte nas faces de fora; o verso do cartão fica dentro. */
export function PanettoneBox({ spec, art, label, showDims }: ModelProps) {
  const W = cm(spec.widthCm, 15, 5);
  const H = cm(spec.heightCm, 16, 6);
  const D = spec.depthCm >= 3 ? spec.depthCm : W;
  const chamfer = isChamfer(spec, W, H, D);
  const dims = useMemo(() => panettoneDims(W, H, D, chamfer), [W, H, D, chamfer]);
  const board = boardOf(spec);
  const paper = printedPaper(art.background, board);
  const panelArt = useMemo(() => ({ ...art, opaque: true }), [art]);
  const front = useArtTexture(dims.frontAspect, "front", panelArt, label);
  const side = useArtTexture(dims.sideAspect, "front", panelArt, label);
  const top = H + dims.handleH;
  const S = 2.4 / Math.max(W, top, D);
  const view = { dims, front, side, paper, board, spec };

  return (
    <group userData={{ view: { elevation: 0.3, azimuth: 0.42 } }}>
      <group scale={S}>{chamfer ? <PanettoneChanfrada {...view} /> : <PanettoneReta {...view} />}</group>
      {showDims && KIND_INFO[spec.kind].dims && <SizeGuide spec={spec} w={W * S} h={H * S} z={(D / 2) * S + 0.02} />}
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Cesta de micro-ondulado
 * ---------------------------------------------------------------------------------------------- */

type BasketDims = {
  W: number;
  D: number;
  H: number;
  /** Espessura do micro-ondulado onda E (uma folha). */
  T: number;
  /** Quanto as paredes menores (em x) e as maiores (em z) abrem para fora da base até a borda. */
  leanX: number;
  leanZ: number;
  /** Orelhas de travamento nos cantos das paredes menores. */
  earW: number;
  earH: number;
  /** Recorte de pega das paredes menores e a distância dele até a borda. */
  holeW: number;
  holeH: number;
  holeGap: number;
};

/** Medidas da cesta montada (L x A x P = boca x altura x boca); inclinação e recortes proporcionais, como nas fotos. */
function basketDims(W: number, H: number, D: number): BasketDims {
  return {
    W,
    D,
    H,
    T: 0.15,
    leanX: Math.min(H * 0.24, W * 0.1),
    leanZ: Math.min(H * 0.26, D * 0.14),
    earW: clamp(D * 0.07, 0.8, 1.6),
    earH: clamp(H * 0.1, 0.5, 1.1),
    holeW: clamp(D * 0.4, 3.5, 9),
    holeH: clamp(H * 0.26, 1.4, 2.6),
    holeGap: clamp(H * 0.17, 0.9, 1.8),
  };
}

type Wall = {
  /** Plano da parede: x = direita de quem olha de fora, y = subindo pela parede, z = normal para fora. */
  frame: THREE.Matrix4;
  /** Comprimento da parede inclinada, meia largura embaixo e na borda. */
  L: number;
  hb: number;
  ht: number;
  end: boolean;
};

/** Parede da cesta de normal horizontal (nx, nz): face de fora com a base no chão e a borda na boca, aberta para fora. */
function wallOf(b: BasketDims, nx: number, nz: number): Wall {
  const end = nx !== 0;
  const dTop = end ? b.W / 2 : b.D / 2;
  const lean = end ? b.leanX : b.leanZ;
  const ht = end ? b.D / 2 : b.W / 2;
  const hb = ht - (end ? b.leanZ : b.leanX);
  const origin = new THREE.Vector3(nx * (dTop - lean), 0, nz * (dTop - lean));
  const up = new THREE.Vector3(nx * dTop, b.H, nz * dTop).sub(origin);
  const L = up.length();
  up.normalize();
  const right = new THREE.Vector3(nz, 0, -nx);
  const out = new THREE.Vector3().crossVectors(right, up);
  return { frame: new THREE.Matrix4().makeBasis(right, up, out).setPosition(origin), L, hb, ht, end };
}

/** Meia largura da parede a uma distância t da base, medida ao longo dela. */
function wallHalf(wall: Wall, t: number) {
  return wall.hb + ((wall.ht - wall.hb) * t) / wall.L;
}

/**
 * Folha de papelão a partir de um contorno no plano da parede (x, y), entre w0 e w1 na normal (w > 0 para fora),
 * separada em [face de fora, face de dentro, corte]. UV da arte: largura 2·half na boca, altura L; `mirror` para a
 * face lida por dentro da cesta.
 */
function sheetGeometry(shape: THREE.Shape, w0: number, w1: number, wall: Wall, half: number, mirror: boolean) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: w1 - w0, bevelEnabled: false, curveSegments: 8 });
  geometry.translate(0, 0, w0);
  const p = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < p.count; i += 1) uv.setXY(i, 0.5 + ((mirror ? -1 : 1) * p.getX(i)) / (2 * half), p.getY(i) / wall.L);
  geometry.applyMatrix4(wall.frame);
  // Grupos do ExtrudeGeometry sem chanfro: [tampa de baixo (w0) + tampa de cima (w1)], depois as laterais.
  const [caps, edges] = geometry.groups;
  const lids = caps.count / 2;
  geometry.clearGroups();
  geometry.addGroup(caps.start + lids, lids, 0);
  geometry.addGroup(caps.start, lids, 1);
  geometry.addGroup(edges.start, edges.count, 2);
  const [outside, inside, cut] = splitGroups(geometry);
  return { outside, inside, cut };
}

/**
 * Folha de fora de uma parede: trapézio até o começo da dobra da borda; nas menores, as orelhas dos cantos (sobem um
 * pouco acima da borda) e o recorte de pega.
 */
function outerShape(b: BasketDims, wall: Wall) {
  const top = wall.L - b.T;
  const hb = wall.hb;
  const ht = wallHalf(wall, top);
  const shape = new THREE.Shape();
  shape.moveTo(-hb, 0);
  shape.lineTo(hb, 0);
  shape.lineTo(ht, top);
  if (wall.end) {
    const { earW, earH } = b;
    shape.quadraticCurveTo(ht + 0.05, top + earH, ht - earW * 0.5, top + earH);
    shape.quadraticCurveTo(ht - earW, top + earH, ht - earW, top);
    shape.lineTo(-ht + earW, top);
    shape.quadraticCurveTo(-ht + earW, top + earH, -ht + earW * 0.5, top + earH);
    shape.quadraticCurveTo(-ht - 0.05, top + earH, -ht, top);
    shape.holes.push(holePath(b, wall));
  } else {
    shape.lineTo(-ht, top);
  }
  shape.lineTo(-hb, 0);
  return shape;
}

/** Folha de dentro (a continuação dobrada na borda): desce até o fundo; nas menores, mais estreita (orelhas) e com o recorte. */
function innerShape(b: BasketDims, wall: Wall) {
  const top = wall.L - b.T;
  const t0 = b.T * 1.3;
  const inset = wall.end ? b.earW : b.T * 2.6;
  const h0 = wallHalf(wall, t0) - inset;
  const h1 = wallHalf(wall, top) - inset;
  const shape = new THREE.Shape();
  shape.moveTo(-h0, t0);
  shape.lineTo(h0, t0);
  shape.lineTo(h1, top);
  shape.lineTo(-h1, top);
  shape.lineTo(-h0, t0);
  if (wall.end) shape.holes.push(holePath(b, wall));
  return shape;
}

function holePath(b: BasketDims, wall: Wall) {
  const cy = wall.L - b.T - b.holeGap - b.holeH / 2;
  return roundedRectPath(b.holeW, b.holeH, b.holeH * 0.3, 0, cy);
}

/** Dobra da borda: meia-volta da folha de fora para a de dentro (raio = espessura), por toda a largura da dobra. */
function foldGeometry(b: BasketDims, wall: Wall) {
  const top = wall.L - b.T;
  const half = wallHalf(wall, top) - (wall.end ? b.earW : 0);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(wall.frame);
  return gridGeometry(1, 10, (i, j) => {
    const phi = (Math.PI * j) / 10;
    const p = new THREE.Vector3((i ? 1 : -1) * half, top + b.T * Math.sin(phi), -b.T + b.T * Math.cos(phi)).applyMatrix4(wall.frame);
    const n = new THREE.Vector3(0, Math.sin(phi), Math.cos(phi)).applyMatrix3(normalMatrix).normalize();
    return { p, n, uv: [0, 0] };
  });
}

/** As quatro paredes (folha de fora, de dentro e a dobra) e o fundo. */
function basketParts(b: BasketDims) {
  const walls = [wallOf(b, 0, 1), wallOf(b, 1, 0), wallOf(b, 0, -1), wallOf(b, -1, 0)].map((wall) => ({
    end: wall.end,
    outer: sheetGeometry(outerShape(b, wall), -b.T, 0, wall, wall.ht, false),
    inner: sheetGeometry(innerShape(b, wall), -2 * b.T, -b.T, wall, wall.ht, true),
    fold: foldGeometry(b, wall),
  }));
  const floor = new THREE.BoxGeometry(b.W - 2 * b.leanX, b.T, b.D - 2 * b.leanZ);
  floor.translate(0, b.T / 2, 0);
  const all = [floor, ...walls.flatMap(({ outer, inner, fold }) => [outer.outside, outer.inside, outer.cut, inner.outside, inner.inside, inner.cut, fold])];
  return { walls, floor, all };
}

/* --------------------------------------------------------------------------- forro e itens */

/** Meia largura e meia profundidade livres por dentro das paredes numa altura y (folha dupla e uma folga). */
function innerFree(b: BasketDims, y: number) {
  const k = 1 - clamp(y / b.H, 0, 1);
  return { x: b.W / 2 - b.leanX * k - 2.6 * b.T - 0.12, z: b.D / 2 - b.leanZ * k - 2.6 * b.T - 0.12 };
}

/**
 * Papel de seda amassado forrando a cesta: um leito fofo a `bed` cm do fundo e as bordas subindo pelas paredes até um
 * pouco abaixo da boca (a face impressa de dentro aparece acima dele), com dois tufos que passam da borda atrás.
 */
function tissueGeometry(b: BasketDims, bed: number) {
  const random = rng(11);
  const waves = Array.from({ length: 7 }, () => ({ fu: 4 + random() * 10, fv: 4 + random() * 10, phase: random() * Math.PI * 2, amp: 0.1 + random() * 0.16 }));
  const crumple = (u: number, v: number) => waves.reduce((sum, w) => sum + w.amp * Math.sin(w.fu * u + w.fv * v + w.phase), 0);
  const floorY = b.T + bed;
  const flat = 0.55;
  const geometry = new THREE.PlaneGeometry(2, 2, 64, 40);
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i += 1) {
    const u = p.getX(i);
    const v = p.getY(i);
    const rho = Math.max((Math.abs(u) ** 4 + Math.abs(v) ** 4) ** 0.25, 1e-6);
    const un = u / rho;
    const vn = v / rho;
    const c = crumple(u, v);
    if (rho <= flat) {
      const y = floorY + c * 0.45;
      const free = innerFree(b, y);
      p.setXYZ(i, (u / flat) * free.x * 0.9, y, (v / flat) * free.z * 0.9);
      continue;
    }
    const k = (rho - flat) / (1 - flat);
    // Quanto a borda do papel passa da boca: abaixo dela em volta, com tufos no canto de trás à esquerda e à direita.
    const angle = Math.atan2(vn, un);
    const tuft = (center: number, width: number) => Math.exp(-((Math.atan2(Math.sin(angle - center), Math.cos(angle - center)) / width) ** 2));
    const over = -1.5 + 3.6 * tuft(-2.35, 0.42) + 2.6 * tuft(-0.4, 0.36) + 0.35 * Math.sin(angle * 7 + 1.3);
    const y = lerp(floorY, b.H + over, k) + c * 0.5;
    const free = innerFree(b, Math.min(y, b.H));
    // Rente às paredes, com as pregas puxando para dentro; acima da boca o papel tomba um pouco para dentro.
    const pull = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(c * 9)) + Math.max(0, y - b.H) * 0.35;
    const reach = lerp(0.9, 1, smoothstep(k, 0, 0.35));
    p.setXYZ(i, un * (free.x * reach - pull), y, vn * (free.z * reach - pull));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Pão francês: fuso de base achatada e pontas mais finas, com a pestana (o corte comprido no alto), cor por vértice. */
function rollGeometry(length: number, width: number, height: number) {
  const geometry = new THREE.SphereGeometry(1, 36, 22);
  const p = geometry.getAttribute("position");
  const colors = new Float32Array(p.count * 3);
  const crustTop = new THREE.Color("#a9631f");
  const crustSide = new THREE.Color("#d6a05a");
  const crumb = new THREE.Color("#f0d8a2");
  const base = new THREE.Color("#e0b676");
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const along = Math.max(0, 1 - x * x * 1.2);
    const split = Math.exp(-(((z - 0.1 * Math.sin(x * 2.6)) / 0.17) ** 2)) * along * smoothstep(y, 0.5, 0.95);
    const taper = 1 - 0.3 * x * x;
    p.setXYZ(i, (x * length) / 2, (y >= 0 ? y * height * (1 - 0.2 * split) : y * height * 0.28) * taper, (z * width * taper) / 2);
    if (y < 0) color.copy(base);
    else color.copy(crustSide).lerp(crustTop, smoothstep(y, 0.2, 0.9));
    color.lerp(crumb, Math.min(1, split * 1.4));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Ovo de chocolate (mais cheio embaixo), centrado na origem com o eixo em y. */
function eggGeometry(length: number, radius: number) {
  const points: Pt[] = [];
  const n = 40;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    points.push([radius * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * (1.08 - 0.16 * t), (t - 0.5) * length]);
  }
  return lathe(points, 48);
}

type Placed = { x: number; y: number; z: number; rx: number; ry: number; rz: number };

/**
 * Forro e itens: dois pães lado a lado à esquerda e um terceiro atravessado por cima deles, e o ovo deitado à
 * direita; só o pão de cima e o ovo passam um pouco da boca. Em escala com a cesta.
 */
function basketItems(b: BasketDims) {
  const k = clamp(Math.min(b.W / 31.2, b.D / 17.8, b.H / 8.1), 0.5, 1.3);
  const bed = b.H * 0.3;
  const floorY = b.T + bed;
  const tissue = tissueGeometry(b, bed);
  const roll = rollGeometry(10 * k, 5 * k, 3.4 * k);
  const egg = eggGeometry(10 * k, 3.2 * k);
  const rest = floorY + 0.28 * 3.4 * k - 0.25 * k;
  const rolls: Placed[] = [
    { x: -6.6 * k, y: rest, z: 3 * k, rx: 0, ry: -0.08, rz: 0.03 },
    { x: -6 * k, y: rest, z: -2.4 * k, rx: 0, ry: -0.1, rz: -0.03 },
    { x: -8.6 * k, y: rest + 4.1 * k, z: 0.2 * k, rx: 0.05, ry: Math.PI / 2 + 0.22, rz: 0 },
  ];
  const eggAt: Placed = { x: 6 * k, y: floorY + 3.75 * k, z: -0.4 * k, rx: -0.1, ry: 0.35, rz: 1.48 };
  return { tissue, roll, egg, rolls, eggAt, all: [tissue, roll, egg] };
}

/**
 * Embalagem cesta / cesta para presente: micro-ondulado onda E com as paredes abertas para fora, todas de folha
 * dupla dobrada na borda (impressa por fora e por dentro), orelhas nos cantos e recorte de pega nas menores; fundo
 * com o verso do papelão (branco ou kraft, conforme o pedido) e o miolo kraft no corte. Arrumada como presente.
 */
export function BasketBox({ spec, art, label, showDims }: ModelProps) {
  const W = cm(spec.widthCm, 31.2, 8);
  const H = cm(spec.heightCm, 8.1, 3);
  const D = spec.depthCm >= 3 ? spec.depthCm : W * 0.57;
  const board = boardOf(spec);
  const paper = printedPaper(art.background, board);
  const inner = /\binterior kraft\b/.test(spec.details ?? "") ? KRAFT : "#f3f1eb";
  const dims = useMemo(() => basketDims(W, H, D), [W, H, D]);
  const panelArt = useMemo(() => ({ ...art, opaque: true }), [art]);
  const long = useArtTexture(dims.W / Math.hypot(dims.H, dims.leanZ), "front", panelArt, label);
  const short = useArtTexture(dims.D / Math.hypot(dims.H, dims.leanX), "front", panelArt, label);
  const parts = useMemo(() => basketParts(dims), [dims]);
  const items = useMemo(() => basketItems(dims), [dims]);
  useGeometriesCleanup(parts.all);
  useGeometriesCleanup(items.all);

  const S = 2.4 / Math.max(W, H, D);
  const cut = <meshStandardMaterial color="#b88e5c" roughness={0.95} />;

  return (
    <group userData={{ view: { elevation: 0.48, azimuth: 0.36 } }}>
      <group scale={S}>
        {parts.walls.map(({ end, outer, inner: lining, fold }, i) => (
          <group key={i}>
            <mesh geometry={outer.outside} castShadow receiveShadow>
              <Ink map={end ? short : long} spec={spec} tint={board.tint} />
            </mesh>
            <mesh geometry={outer.inside} receiveShadow>
              <Coated color={paper} spec={spec} />
            </mesh>
            <mesh geometry={outer.cut}>{cut}</mesh>
            <mesh geometry={lining.inside} castShadow receiveShadow>
              <Ink map={end ? short : long} spec={spec} tint={board.tint} />
            </mesh>
            <mesh geometry={lining.cut}>{cut}</mesh>
            <mesh geometry={fold} castShadow receiveShadow>
              <Coated color={paper} spec={spec} />
            </mesh>
          </group>
        ))}
        <mesh geometry={parts.floor} receiveShadow>
          <meshStandardMaterial attach="material-0" color="#b88e5c" roughness={0.95} />
          <meshStandardMaterial attach="material-1" color="#b88e5c" roughness={0.95} />
          <meshStandardMaterial attach="material-2" color={inner} roughness={0.92} />
          <Coated attach="material-3" color={paper} spec={spec} />
          <meshStandardMaterial attach="material-4" color="#b88e5c" roughness={0.95} />
          <meshStandardMaterial attach="material-5" color="#b88e5c" roughness={0.95} />
        </mesh>

        <mesh geometry={items.tissue} castShadow receiveShadow>
          <meshStandardMaterial color="#f6f4ef" roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
        {items.rolls.map(({ x, y, z, rx, ry, rz }, i) => (
          <mesh key={i} geometry={items.roll} position={[x, y, z]} rotation={[rx, ry, rz]} castShadow receiveShadow>
            <meshStandardMaterial vertexColors roughness={0.78} />
          </mesh>
        ))}
        <mesh geometry={items.egg} position={[items.eggAt.x, items.eggAt.y, items.eggAt.z]} rotation={[items.eggAt.rx, items.eggAt.ry, items.eggAt.rz]} castShadow receiveShadow>
          <meshPhysicalMaterial color="#4a2915" roughness={0.34} clearcoat={0.35} clearcoatRoughness={0.3} />
        </mesh>
      </group>
      {showDims && KIND_INFO[spec.kind].dims && <SizeGuide spec={spec} w={W * S} h={H * S} z={(D / 2) * S + 0.02} />}
    </group>
  );
}
