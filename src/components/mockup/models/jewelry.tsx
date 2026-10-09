"use client";

// Cartela para bijuteria (hangtag, variant jewelry): cartão 300 g recortado com faca, cantos arredondados,
// impresso só na frente (4/0). Segue o desenho técnico de cada formato:
// - 4,5x4,5: furo redondo de pendurar no topo, duas fendas em "C" (abas com o furinho do pino no meio)
//   e dois furinhos mais abaixo;
// - 5x8: furo no topo, fendas diagonais para corrente saindo das laterais até um furinho, duas abas em "D"
//   com dois furinhos cada e a fenda de anel com a curva na ponta.
// A cena é a da foto do produto: a cartela em pé, levemente em 3/4, com um par de argolas prateadas
// grandes (maiores que a cartela) atravessando as abas e pendendo abaixo dela, quase perpendiculares
// ao cartão, metade na frente e metade atrás.
// Tudo em centímetros dentro de um grupo escalado; as cotas ficam fora, em unidades de cena.

import { useMemo } from "react";
import * as THREE from "three";
import type { MockupSpec } from "@/lib/mockup";
import { KIND_INFO } from "@/lib/mockup-kinds";
import { useGeometriesCleanup } from "./fabric";
import { Dimensions, PrintMaterial, backVariant, faceGeometry, makeShape, metalColor, sizeLabels, useArtTexture, type ModelProps } from "./shared";

const clamp = THREE.MathUtils.clamp;
const V2 = THREE.Vector2;

/** Cartão 300 g (~0,4 mm), levemente exagerado para a borda aparecer de lado. */
const PAPER = 0.05;
/** Raio dos cantos da faca de corte (desenho técnico: ~0,4 cm). */
const CORNER = 0.38;
/** Afasta as faces impressas da borda extrudada (sem z-fighting). */
const LIFT = 0.004;
/** Largura das fendas: as abas dos brincos abrem um pouco (como na foto); as de corrente e anel, quase nada. */
const TAB_CUT = 0.07;
const FINE_CUT = 0.045;
/** Furinho do pino do brinco. */
const DOT = 0.065;
/** Giro da cartela: o lado direito vem para a frente, a foto de catálogo (3/4 à direita) fica em ~30°. */
const YAW = -0.35;
/** Seção da argola: fita lisa e larga no sentido do eixo, fina no raio. */
const HOOP = { band: 0.34, thick: 0.09, round: 0.035 };

/* ------------------------------------------------------------------ */
/* Geometria                                                           */
/* ------------------------------------------------------------------ */

/** Pontos de um arco (ângulos em radianos, do primeiro ao segundo, incluindo os dois). */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, steps: number) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / steps;
    return new V2(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });
}

/** Junta trechos de uma linha central sem repetir o ponto de emenda. */
function chain(...parts: THREE.Vector2[][]) {
  const out: THREE.Vector2[] = [];
  parts.forEach((part) => part.forEach((p) => (out.length && out[out.length - 1].distanceTo(p) < 1e-6 ? undefined : out.push(p))));
  return out;
}

/** Fenda de faca ao longo de uma linha central: contorno fechado com largura `width` e pontas retas. */
function cut(points: THREE.Vector2[], width: number) {
  const n = points.length;
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  points.forEach((p, i) => {
    const t = points[Math.min(i + 1, n - 1)].clone().sub(points[Math.max(i - 1, 0)]).normalize();
    const normal = new V2(-t.y, t.x).multiplyScalar(width / 2);
    left.push(p.clone().add(normal));
    right.push(p.clone().sub(normal));
  });
  const path = new THREE.Path();
  path.moveTo(left[0].x, left[0].y);
  left.slice(1).forEach((p) => path.lineTo(p.x, p.y));
  right.reverse().forEach((p) => path.lineTo(p.x, p.y));
  path.closePath();
  return path;
}

function circleHole(cx: number, cy: number, r: number) {
  const path = new THREE.Path();
  path.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return path;
}

/**
 * Aba do brinco: arco em volta do furinho (do lado `side`: -1 esquerda, 1 direita) e duas pernas retas
 * de comprimento `leg` para o lado oposto, onde fica a dobra da aba (a ponta aberta do "C" ou do "D").
 */
function tabCut(cx: number, cy: number, r: number, leg: number, side: -1 | 1) {
  return cut(
    chain(
      [new V2(cx - side * leg, cy + r), new V2(cx, cy + r)],
      arcPoints(cx, cy, r, Math.PI / 2, Math.PI / 2 - side * Math.PI, 20),
      [new V2(cx, cy - r), new V2(cx - side * leg, cy - r)],
    ),
    TAB_CUT,
  );
}

type Hang = { x: number; y: number };

type CardCut = { shape: THREE.Shape; hoops: [Hang, Hang] };

/** Cartela quadrada 4,5x4,5: furo de pendurar, abas em "C" com o pino e dois furinhos abaixo. */
function squareCard(w: number, h: number): CardCut {
  const shape = makeShape("rect", w, h, CORNER);
  const top = h / 2;
  const dx = w * 0.213;
  const y = top - h * 0.455;
  shape.holes.push(circleHole(0, top - h * 0.138, w * 0.064));
  ([-1, 1] as const).forEach((side) => {
    shape.holes.push(tabCut(side * dx, y, w * 0.075, w * 0.047, side));
    shape.holes.push(circleHole(side * dx, y, DOT));
    shape.holes.push(circleHole(side * dx, y - h * 0.256, DOT));
  });
  return { shape, hoops: [{ x: -dx, y }, { x: dx, y }] };
}

/**
 * Cartela 5x8: furo de pendurar, fendas diagonais de corrente vindas das laterais (param a um fio da
 * borda e do furinho, para o contorno não se cruzar), abas em "D" com dois furinhos e a fenda de anel.
 */
function tallCard(w: number, h: number): CardCut {
  const shape = makeShape("rect", w, h, CORNER);
  const top = h / 2;
  shape.holes.push(circleHole(0, top - h * 0.106, 0.26));
  const tab = { y: top - h * 0.466, r: 0.35, arc: w / 2 - w * 0.29, leg: w * 0.14 };
  ([-1, 1] as const).forEach((side) => {
    // Fenda da corrente: da lateral (a 0,9 cm do topo) até o furinho (1,06 cm da lateral, 2,1 cm do topo).
    const dot = new V2(side * (w / 2 - w * 0.212), top - h * 0.26);
    const edge = new V2(side * (w / 2 - 0.02), top - h * 0.114);
    const end = dot.clone().add(edge.clone().sub(dot).setLength(0.1 + 0.02));
    shape.holes.push(cut([edge, end], FINE_CUT));
    shape.holes.push(circleHole(dot.x, dot.y, 0.1));
    // Aba em "D": a curva fica para dentro da cartela, a dobra para a lateral.
    const cx = side * tab.arc;
    shape.holes.push(tabCut(cx, tab.y, tab.r, tab.leg, (-side) as -1 | 1));
    shape.holes.push(circleHole(cx + side * 0.07, tab.y, DOT));
    shape.holes.push(circleHole(cx + side * 0.53, tab.y, DOT));
  });
  // Fenda de anel: reta com a volta em arco na ponta direita.
  const ringY = top - h * 0.697;
  const bump = { x: w * 0.135, r: w * 0.045 };
  shape.holes.push(
    cut(chain([new V2(-w * 0.18, ringY), new V2(bump.x - bump.r, ringY)], arcPoints(bump.x, ringY, bump.r, Math.PI, 0, 14)), FINE_CUT),
  );
  // A argola entra pelo furinho de dentro da aba.
  return { shape, hoops: [{ x: -(tab.arc + 0.07), y: tab.y }, { x: tab.arc + 0.07, y: tab.y }] };
}

/** Verso da face: mesma área (o recorte não é simétrico), virada para -z, com a arte lida de trás. */
function backFace(face: THREE.BufferGeometry) {
  const g = face.clone();
  const index = g.getIndex();
  if (index) {
    const a = index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    index.needsUpdate = true;
  }
  const normal = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < normal.count; i += 1) {
    normal.setXYZ(i, 0, 0, -1);
    uv.setX(i, 1 - uv.getX(i));
  }
  normal.needsUpdate = true;
  uv.needsUpdate = true;
  return g;
}

/**
 * Argola de fita: perfil de cantos arredondados (raio × altura, anti-horário: fora subindo, topo, dentro
 * descendo, base) girado em torno do eixo. O aro fica no plano XY com o ponto mais alto da fita na origem.
 */
function hoopGeometry(radius: number) {
  const { band, thick, round } = HOOP;
  const corners: [number, number, number][] = [
    [radius - round, band / 2 - round, 0],
    [radius - thick + round, band / 2 - round, Math.PI / 2],
    [radius - thick + round, -band / 2 + round, Math.PI],
    [radius - round, -band / 2 + round, Math.PI * 1.5],
  ];
  const profile = corners.flatMap(([cx, cy, a0]) => arcPoints(cx, cy, round, a0, a0 + Math.PI / 2, 4));
  profile.push(profile[0].clone());
  const g = new THREE.LatheGeometry(profile, 160);
  g.rotateX(Math.PI / 2);
  g.translate(0, -(radius - thick / 2), 0);
  return g;
}

/* ------------------------------------------------------------------ */
/* Modelo                                                              */
/* ------------------------------------------------------------------ */

type Paper = { edge: string; back: string };

/** Cor do papel (borda e verso sem impressão) pelas opções: cartão branco, kraft ou reciclato. */
function paperOf(spec: MockupSpec): Paper {
  const details = spec.details ?? "";
  if (/\bkraft\b/.test(details)) return { edge: "#b48a5c", back: "#c29a6c" };
  if (/\breciclato\b/.test(details)) return { edge: "#ded7c6", back: "#e9e3d4" };
  return { edge: "#f1eee7", back: "#f7f6f2" };
}

/**
 * Cartela para bijuteria em pé com um par de argolas prateadas grandes atravessando as abas: o pino passa
 * pelo cartão e o aro pende quase perpendicular a ele (giros diferentes em cada argola, como na foto).
 */
export function JewelryCard({ spec, art, label, showDims }: ModelProps) {
  const w = clamp(spec.widthCm, 2.5, 12);
  const h = clamp(spec.heightCm, 2.5, 16);
  // Retangular em pé (5x8): desenho técnico da cartela alta.
  const tall = h >= w * 1.3;
  const front = useArtTexture(w / h, "front", art, label);
  const backKind = backVariant(spec);
  const backTex = useArtTexture(w / h, backKind, art, label);
  const back = backKind === "blank" ? null : backTex;
  const paper = paperOf(spec);
  // Argola um pouco maior que a cartela (na 5x8, maior que a parte de baixo dela).
  const hoopR = (Math.max(w, h * 0.6) * 1.07) / 2;

  const card = useMemo(() => {
    const { shape, hoops } = tall ? tallCard(w, h) : squareCard(w, h);
    const edge = new THREE.ExtrudeGeometry(shape, { depth: PAPER, bevelEnabled: false, curveSegments: 16 });
    edge.translate(0, 0, -PAPER / 2);
    const face = faceGeometry(shape, w, h);
    return { edge, face, back: backFace(face), hoops };
  }, [w, h, tall]);
  const hoop = useMemo(() => hoopGeometry(hoopR), [hoopR]);
  const geometries = useMemo(() => [card.edge, card.face, card.back, hoop], [card, hoop]);
  useGeometriesCleanup(geometries);

  const S = 1.6 / Math.max(w, h);
  const [lw, lh] = sizeLabels(spec);
  // Giro de cada argola em torno do pino: a metade da esquerda fica na frente do cartão.
  const turns = [1.22, 1.43];

  return (
    <group rotation-y={YAW}>
      <group scale={S}>
        <mesh geometry={card.edge} castShadow receiveShadow>
          <meshStandardMaterial color={paper.edge} roughness={0.92} />
        </mesh>
        <mesh geometry={card.face} position-z={PAPER / 2 + LIFT} receiveShadow>
          <PrintMaterial map={front} spec={spec} />
        </mesh>
        <mesh geometry={card.back} position-z={-PAPER / 2 - LIFT} receiveShadow>
          {back ? <PrintMaterial map={back} spec={spec} /> : <meshStandardMaterial color={paper.back} roughness={0.9} />}
        </mesh>
        {card.hoops.map((at, i) => (
          <mesh key={i} geometry={hoop} position={[at.x, at.y, 0]} rotation-y={turns[i]} castShadow receiveShadow>
            <meshStandardMaterial color={metalColor("silver")} metalness={1} roughness={0.14} envMapIntensity={1.5} />
          </mesh>
        ))}
      </group>
      {showDims && KIND_INFO[spec.kind].dims && <Dimensions w={w * S} h={h * S} z={(PAPER / 2 + 0.02) * S} labelW={lw} labelH={lh} />}
    </group>
  );
}
