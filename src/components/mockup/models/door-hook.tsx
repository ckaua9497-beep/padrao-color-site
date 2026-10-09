"use client";

// Identificador de porta (produto novo, variant "door-hook" do kind panel): peça vertical recortada em PS
// branco (ou cartão), impressa frente e verso (4/4), com a arte cobrindo as duas faces inteiras.
// O topo segue o desenho técnico de cada formato:
// - 9x27 e 9,6x32: gancho aberto, um "C" que abraça a maçaneta: o aro de fora sobra um pouco da lateral
//   esquerda, faz a volta por cima e termina numa ponta arredondada à direita; o furo de dentro desce
//   num canal inclinado que sai pela lateral direita, por onde a maçaneta entra;
// - 9x27,5 e 9,6x33,3: topo em meia-lua com um furo redondo fechado, concêntrico.
// Cantos de baixo arredondados. A cena é a da foto do produto: a peça em pé sozinha, levemente em 3/4,
// mostrando a espessura da chapa. Tudo em centímetros dentro de um grupo escalado.

import { useMemo } from "react";
import * as THREE from "three";
import { KIND_INFO } from "@/lib/mockup-kinds";
import { useGeometriesCleanup } from "./fabric";
import { Dimensions, PrintMaterial, sizeLabels, useArtTexture, type ModelProps } from "./shared";

const V2 = THREE.Vector2;

/** Afasta as faces impressas da chapa extrudada (sem z-fighting). */
const LIFT = 0.012;
/** Giro da peça: a lateral direita vem um pouco para a frente e mostra a espessura. */
const YAW = -0.18;

/**
 * Contorno com gancho aberto (medidas do desenho técnico 9x27, proporcionais à largura). Percorrido no
 * sentido anti-horário: base, lateral direita, piso do canal, furo (horário, por dentro), ponta do gancho,
 * aro de fora por cima e lateral esquerda.
 */
function hookShape(w: number, h: number, corner: number) {
  const R = 0.53 * w;
  const r = 0.26 * w;
  const cx = -0.05 * w;
  const cy = h / 2 - R;
  // Ângulo da ponta do gancho (logo abaixo da horizontal, à direita) e de entrada do canal no furo.
  const tip = -0.09;
  const entry = 3.8;
  const capR = (R - r) / 2;
  const mid = (R + r) / 2;
  const bottom = -h / 2;
  // Onde o aro de fora encontra a lateral esquerda.
  const join = Math.atan2(-Math.sqrt(R * R - (w / 2 + cx) ** 2), -w / 2 - cx);
  const floorRight = new V2(0.4 * w, cy - 0.435 * w);
  const floorLeft = new V2(-0.107 * w, cy - 0.3 * w);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + corner, bottom);
  s.absarc(w / 2 - corner, bottom + corner, corner, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, cy - 0.53 * w);
  s.quadraticCurveTo(w / 2, cy - 0.45 * w, floorRight.x, floorRight.y);
  s.lineTo(floorLeft.x, floorLeft.y);
  s.quadraticCurveTo(-0.2 * w, cy - 0.275 * w, cx + r * Math.cos(entry), cy + r * Math.sin(entry));
  s.absarc(cx, cy, r, entry, tip, true);
  s.absarc(cx + mid * Math.cos(tip), cy + mid * Math.sin(tip), capR, tip + Math.PI, tip + Math.PI * 2, false);
  s.absarc(cx, cy, R, tip, join + Math.PI * 2, false);
  s.lineTo(-w / 2, bottom + corner);
  s.absarc(-w / 2 + corner, bottom + corner, corner, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Contorno com furo fechado: topo em meia-lua e furo concêntrico de ~2/3 da largura. */
function loopShape(w: number, h: number, corner: number) {
  const cy = h / 2 - w / 2;
  const bottom = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + corner, bottom);
  s.absarc(w / 2 - corner, bottom + corner, corner, -Math.PI / 2, 0, false);
  s.absarc(0, cy, w / 2, 0, Math.PI, false);
  s.absarc(-w / 2 + corner, bottom + corner, corner, Math.PI, Math.PI * 1.5, false);
  s.holes.push(new THREE.Path().absarc(0, cy, 0.34 * w, 0, Math.PI * 2, true));
  return s;
}

/** Face impressa com UV na caixa do contorno inteiro (o gancho sobra da lateral: a arte cobre tudo). */
function printFace(shape: THREE.Shape) {
  const g = new THREE.ShapeGeometry(shape, 48);
  g.computeBoundingBox();
  const box = g.boundingBox ?? new THREE.Box3();
  const size = box.getSize(new THREE.Vector3());
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, (pos.getX(i) - box.min.x) / size.x, (pos.getY(i) - box.min.y) / size.y);
  uv.needsUpdate = true;
  return { face: g, aspect: size.x / size.y };
}

/** Verso: a mesma área virada para -z (o contorno não é simétrico), com a arte lida de trás. */
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

/** Furo fechado nos formatos 9x27,5 e 9,6x33,3; gancho aberto nos demais (9x27, 9,6x32 e sob medida). */
function closedLoop(details: string, h: number) {
  return /27[,.]5|33[,.]3/.test(details) || Math.abs(h - 27.5) < 0.05 || Math.abs(h - 33.3) < 0.05;
}

export function DoorHook({ spec, art, label, showDims }: ModelProps) {
  // Sempre em pé: a menor medida é a largura.
  const w = Math.max(Math.min(spec.widthCm, spec.heightCm), 2);
  const h = Math.max(spec.widthCm, spec.heightCm, w * 1.8);
  const details = spec.details ?? "";
  const paper = /\bcartao\b|\bmarkatto\b/.test(details);
  // PS: espessura da opção (0,3, 1 ou 2 mm); papel: ~0,4 mm.
  const d = paper ? 0.04 : spec.depthCm > 0 && spec.depthCm <= 0.3 ? spec.depthCm : 0.1;
  const closed = closedLoop(details, h);
  const corner = 0.1 * w;

  const plate = useMemo(() => {
    const shape = closed ? loopShape(w, h, corner) : hookShape(w, h, corner);
    const body = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 48 });
    body.translate(0, 0, -d / 2);
    const { face, aspect } = printFace(shape);
    return { body, face, back: backFace(face), aspect };
  }, [w, h, d, corner, closed]);
  const geometries = useMemo(() => [plate.body, plate.face, plate.back], [plate]);
  useGeometriesCleanup(geometries);

  const front = useArtTexture(plate.aspect, "front", art, label);
  // Impresso frente e verso: o verso repete a arte (ou o cinza da opção 4/1).
  const back = useArtTexture(plate.aspect, spec.back === "gray" ? "gray" : "front", art, label);
  const U = 2.4 / h;
  const [lw, lh] = sizeLabels(spec);
  const labels: [string, string] = spec.widthCm > spec.heightCm ? [lh, lw] : [lw, lh];

  return (
    <group rotation-y={YAW}>
      <group scale={U}>
        <mesh geometry={plate.body} castShadow receiveShadow>
          <meshStandardMaterial color={paper ? "#f4f3ef" : "#f3f3f1"} roughness={paper ? 0.9 : 0.42} />
        </mesh>
        <mesh geometry={plate.face} position-z={d / 2 + LIFT} castShadow receiveShadow>
          <PrintMaterial map={front} spec={spec} />
        </mesh>
        <mesh geometry={plate.back} position-z={-d / 2 - LIFT} receiveShadow>
          <PrintMaterial map={back} spec={spec} />
        </mesh>
      </group>
      {showDims && KIND_INFO[spec.kind].dims && <Dimensions w={w * U} h={h * U} z={(d / 2 + LIFT) * U + 0.004} labelW={labels[0]} labelH={labels[1]} />}
    </group>
  );
}
