// Pespontos (linha de costura) das barras e da gola: pontinhos alinhados sobre o tecido, desenhados
// como instâncias de um cilindro curto. TS puro (three só para a geometria).

import * as THREE from "three";
import type { GarmentShape } from "./garment.ts";
import type { SleevePiece } from "./pieces.ts";

const TAU = Math.PI * 2;

export type StitchLine = { points: THREE.Vector3[]; normals: THREE.Vector3[]; closed: boolean };

/** Ponto curto da costura: cilindro deitado ao longo do eixo y (vira na direção da linha). */
export function stitchGeometry(length = 0.24, radius = 0.032): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, 5, 1, false);
  return g;
}

/** Matrizes dos pontos ao longo das linhas (um ponto a cada `pitch` cm, um pouco acima do tecido). */
export function stitchMatrices(lines: StitchLine[], pitch = 0.36, lift = 0.07, flatten = 0.6): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  const t = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, flatten);
  for (const line of lines) {
    const pts = line.closed ? [...line.points, line.points[0]] : line.points;
    const nrm = line.closed ? [...line.normals, line.normals[0]] : line.normals;
    let carry = pitch / 2;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const seg = a.distanceTo(b);
      if (seg < 1e-6) continue;
      t.copy(b).sub(a).normalize();
      let at = carry;
      while (at < seg) {
        const f = at / seg;
        p.copy(a).lerp(b, f);
        n.copy(nrm[i - 1]).lerp(nrm[i], f).normalize();
        p.addScaledVector(n, lift);
        // Base: y ao longo da linha, z para fora do tecido (achatado), x de lado.
        side.crossVectors(t, n).normalize();
        up.crossVectors(side, t).normalize();
        rot.makeBasis(side, t, up);
        q.setFromRotationMatrix(rot);
        out.push(new THREE.Matrix4().compose(p, q, scale));
        at += pitch;
      }
      carry = at - seg;
    }
  }
  return out;
}

/** Linha da barra do corpo a `distance` cm da borda, em volta da peça. */
export function hemStitch(shape: GarmentShape, distance: number, samples = 520): StitchLine {
  const y = shape.yHem + distance;
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  for (let i = 0; i < samples; i += 1) {
    const phi = (i / samples) * TAU;
    points.push(shape.point(phi, y));
    normals.push(shape.normal(phi, y));
  }
  return { points, normals, closed: true };
}

/** Linha logo abaixo do decote (pesponto da gola), a `distance` cm do decote. */
export function neckStitch(shape: GarmentShape, distance: number, samples = 300): StitchLine {
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  for (let i = 0; i < samples; i += 1) {
    const phi = (i / samples) * TAU;
    const y = shape.neckline(phi) - distance;
    points.push(shape.point(phi, y));
    normals.push(shape.normal(phi, y));
  }
  return { points, normals, closed: true };
}

/** Linha na manga a `distance` cm da boca (lado +x), andando pelas linhas da malha da manga. */
export function sleeveStitch(sleeve: SleevePiece, distance: number): StitchLine {
  const pos = sleeve.geometry.getAttribute("position") as THREE.BufferAttribute;
  const cols = sleeve.hem.length + 1;
  const rows = pos.count / cols;
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let c = 0; c < cols - 1; c += 1) {
    let walked = 0;
    let r = rows - 1;
    a.fromBufferAttribute(pos, r * cols + c);
    let found = a.clone();
    while (r > 0) {
      b.fromBufferAttribute(pos, (r - 1) * cols + c);
      const seg = a.distanceTo(b);
      if (walked + seg >= distance) {
        found = a.clone().lerp(b, (distance - walked) / seg);
        break;
      }
      walked += seg;
      a.copy(b);
      r -= 1;
    }
    points.push(found);
    normals.push(sleeve.hemOut[c].clone());
  }
  return { points, normals, closed: true };
}

