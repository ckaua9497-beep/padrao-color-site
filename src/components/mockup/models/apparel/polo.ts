// Gola de polo: pé de gola (faixa em pé no pescoço), gola dobrada que deita sobre os ombros com as pontas
// na frente, carcela com pesponto e botões. TS puro (three só para a geometria).

import * as THREE from "three";
import { clamp, fixOutward, gridIndex, gridNormals, smoothstep } from "./body.ts";
import { phiAtArc, type GarmentShape } from "./garment.ts";
import { ribFrames, ribProfile, sweepPiece, type Frame } from "./pieces.ts";

const TAU = Math.PI * 2;

export type PoloParts = {
  stand: THREE.BufferGeometry;
  /** Gola dobrada (superfície com as duas faces) e o filete da borda (espessura). */
  fall: THREE.BufferGeometry;
  fallEdge: THREE.BufferGeometry;
  placket: THREE.BufferGeometry;
  placketEdge: THREE.BufferGeometry;
  buttons: { position: THREE.Vector3; normal: THREE.Vector3 }[];
  list: THREE.BufferGeometry[];
};

/** Caminha pela coluna φ, do decote para baixo, até `distance` cm sobre o tecido. */
function walkDown(shape: GarmentShape, phi: number, yStart: number, distance: number): number {
  const a = shape.point(phi, yStart);
  const b = new THREE.Vector3();
  let walked = 0;
  let y = yStart;
  while (walked < distance && y > shape.yHem + 2) {
    y -= 0.05;
    shape.point(phi, y, b);
    walked += a.distanceTo(b);
    a.copy(b);
  }
  return y;
}

export function poloCollar(shape: GarmentShape): PoloParts {
  const k = Math.sqrt(shape.cut.W / 54);
  const standH = 3 * k;
  const placketHalf = 1.6 * k;
  const placketLen = 13.5 * k;
  const yNeck0 = shape.neckline(0);
  // Ponta da carcela no decote: o pé de gola vai de uma borda da carcela até a outra pelas costas.
  const phiP = phiAtArc(shape, placketHalf, yNeck0);
  const samples = 150;
  const curve = Array.from({ length: samples }, (_, i) => {
    const phi = phiP + ((TAU - 2 * phiP) * i) / (samples - 1);
    return { phi, y: shape.neckline(phi) };
  });
  const standFrames = ribFrames(shape, curve, standH, false);
  const stand = sweepPiece(standFrames, ribProfile(standH), false).geometry;

  // Gola dobrada: da dobra (topo do pé, pelo lado de fora) até a borda que deita sobre o tecido.
  const rows = 18;
  const cols = samples;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const uv1 = new Float32Array(cols * rows * 2);
  const outer: THREE.Vector3[] = [];
  const fold = new THREE.Vector3();
  const out = new THREE.Vector3();
  const ctrl = new THREE.Vector3();
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  let along = 0;
  let prevFold: THREE.Vector3 | null = null;
  for (let i = 0; i < cols; i += 1) {
    const f: Frame = standFrames[i];
    const t = i / (cols - 1);
    // Largura da gola deitada: 5,2 cm atrás e nos ombros, crescendo para as pontas da frente (bico).
    const endness = Math.min(t, 1 - t);
    const tip = 1 - smoothstep(0, 0.08, endness);
    const width = (5.2 + 1.1 * (1 - Math.sin(Math.PI * t)) ** 2 + 1.5 * tip) * k;
    fold.copy(f.p).addScaledVector(f.h, standH + 0.05).addScaledVector(f.n, 0.36);
    const yOut = walkDown(shape, curve[i].phi, curve[i].y, width * 0.8);
    shape.point(curve[i].phi, yOut, out);
    shape.normal(curve[i].phi, yOut, nrm);
    out.addScaledVector(nrm, 0.42);
    // Pontas: um pouco para o meio da frente (a gola fecha em bico sobre a carcela).
    if (tip > 0) out.x *= 1 - 0.18 * tip;
    outer.push(out.clone());
    ctrl.copy(fold).addScaledVector(f.n, 0.8 * k).addScaledVector(f.h, 0.25 * k).lerp(out, 0.25);
    if (prevFold) along += fold.distanceTo(prevFold);
    prevFold = fold.clone();
    let rowArc = 0;
    const prevRow = new THREE.Vector3();
    for (let r = 0; r < rows; r += 1) {
      const v = r / (rows - 1);
      const a = (1 - v) * (1 - v);
      const b = 2 * (1 - v) * v;
      const c = v * v;
      p.set(0, 0, 0).addScaledVector(fold, a).addScaledVector(ctrl, b).addScaledVector(out, c);
      if (r > 0) rowArc += p.distanceTo(prevRow);
      prevRow.copy(p);
      const o = r * cols + i;
      pos.set([p.x, p.y, p.z], o * 3);
      uv[o * 2] = t;
      uv[o * 2 + 1] = v;
      uv1[o * 2] = along;
      uv1[o * 2 + 1] = rowArc;
    }
  }
  const fall = new THREE.BufferGeometry();
  fall.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  fall.setAttribute("normal", new THREE.BufferAttribute(gridNormals(pos, cols, rows, false), 3));
  fall.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  fall.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
  fall.setIndex(gridIndex(cols, rows, false));
  fixOutward(fall, (i, o) => o.set(pos[i * 3], 0.3, pos[i * 3 + 2]));

  // Filete da borda da gola (espessura) e das pontas.
  const edgePts = [
    ...Array.from({ length: rows }, (_, r) => new THREE.Vector3().fromArray(pos, (r * cols) * 3)).reverse(),
    ...outer,
    ...Array.from({ length: rows }, (_, r) => new THREE.Vector3().fromArray(pos, (r * cols + cols - 1) * 3)),
  ];
  const fallEdge = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePts, false, "centripetal", 0.2), 360, 0.1, 6, false);

  // Carcela: faixa na frente, do decote para baixo, levemente acima do tecido.
  const pc = 9;
  const pr = 24;
  const ppos = new Float32Array(pc * pr * 3);
  const puv = new Float32Array(pc * pr * 2);
  const puv1 = new Float32Array(pc * pr * 2);
  for (let r = 0; r < pr; r += 1) {
    const y = yNeck0 + 0.3 - ((placketLen + 0.3) * r) / (pr - 1);
    for (let c = 0; c < pc; c += 1) {
      const s = -placketHalf + (2 * placketHalf * c) / (pc - 1);
      const phi = phiAtArc(shape, s, y);
      shape.point(phi, y, p);
      shape.normal(phi, y, nrm);
      p.addScaledVector(nrm, 0.13);
      const o = r * pc + c;
      ppos.set([p.x, p.y, p.z], o * 3);
      puv[o * 2] = c / (pc - 1);
      puv[o * 2 + 1] = r / (pr - 1);
      puv1[o * 2] = s;
      puv1[o * 2 + 1] = y;
    }
  }
  const placket = new THREE.BufferGeometry();
  placket.setAttribute("position", new THREE.BufferAttribute(ppos, 3));
  placket.setAttribute("normal", new THREE.BufferAttribute(gridNormals(ppos, pc, pr, false), 3));
  placket.setAttribute("uv", new THREE.BufferAttribute(puv, 2));
  placket.setAttribute("uv1", new THREE.BufferAttribute(puv1, 2));
  placket.setIndex(gridIndex(pc, pr, false));
  fixOutward(placket, (i, o) => o.set(ppos[i * 3], 0, ppos[i * 3 + 2]));
  // Contorno da carcela (pesponto em relevo): laterais e fundo.
  const corner = (c: number, r: number) => new THREE.Vector3().fromArray(ppos, (r * pc + c) * 3);
  const outline = [
    ...Array.from({ length: pr }, (_, r) => corner(0, r)),
    ...Array.from({ length: pc - 2 }, (_, c) => corner(c + 1, pr - 1)),
    ...Array.from({ length: pr }, (_, r) => corner(pc - 1, pr - 1 - r)),
  ];
  const placketEdge = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outline, false, "catmullrom", 0.1), 160, 0.07, 5, false);

  // Botões: dois na carcela.
  const buttons = [2.3, 8.2].map((d) => {
    const y = yNeck0 - d * k;
    const position = shape.point(0, y);
    const normal = shape.normal(0, y);
    position.addScaledVector(normal, 0.2);
    return { position, normal };
  });

  return { stand, fall, fallEdge, placket, placketEdge, buttons, list: [stand, fall, fallEdge, placket, placketEdge] };
}

/** Disco do botão (cm), com quatro furos marcados por relevo na face. */
export function buttonGeometry(radius = 0.58): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0, 0.14),
    new THREE.Vector2(radius * 0.62, 0.12),
    new THREE.Vector2(radius * 0.82, 0.18),
    new THREE.Vector2(radius, 0.14),
    new THREE.Vector2(radius * 1.02, 0.06),
    new THREE.Vector2(radius * 0.96, 0),
    new THREE.Vector2(0, 0),
  ];
  const g = new THREE.LatheGeometry(profile.map((v) => new THREE.Vector2(clamp(v.x, 0, radius * 1.1), v.y)).reverse(), 28);
  g.rotateX(Math.PI / 2);
  return g;
}
