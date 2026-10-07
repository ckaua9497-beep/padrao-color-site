// Geometrias procedurais dos móveis (metros). Quem cria em useMemo libera com useGeometryCleanup.

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function roundedRectShape(w: number, h: number, r: number) {
  const rr = Math.max(0.0005, Math.min(r, w / 2 - 0.0005, h / 2 - 0.0005));
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.absarc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - rr);
  s.absarc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(x + rr, y + h);
  s.absarc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + rr);
  s.absarc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5, false);
  return s;
}

/**
 * UV por projeção de caixa (em metros): cada vértice usa o par de eixos da face para onde aponta.
 * Assim a trama e o veio têm o mesmo passo em todos os móveis, sem esticar.
 */
function boxUv(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (ny >= nx && ny >= nz) {
      uv[i * 2] = x;
      uv[i * 2 + 1] = z;
    } else if (nx >= nz) {
      uv[i * 2] = z;
      uv[i * 2 + 1] = y;
    } else {
      uv[i * 2] = x;
      uv[i * 2 + 1] = y;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * Bloco centrado de w × h × d com cantos (no plano xz) de raio `radius` e arestas de cima e de baixo
 * boleadas em `bevel`: estofado, tampo, colchão. Normais suaves (luz corre macia pelo chanfro).
 */
export function softBlock(w: number, h: number, d: number, radius: number, bevel: number): THREE.BufferGeometry {
  const b = Math.max(0.001, Math.min(bevel, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002));
  const shape = roundedRectShape(Math.max(w - 2 * b, 0.002), Math.max(d - 2 * b, 0.002), Math.max(radius - b, 0.0005));
  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(h - 2 * b, 0.001),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 3,
    curveSegments: 4,
  });
  // Extrusão em z vira altura (y); a forma fica no plano do chão.
  extruded.rotateX(-Math.PI / 2);
  extruded.translate(0, b - h / 2, 0);
  extruded.deleteAttribute("uv");
  extruded.deleteAttribute("normal");
  const merged = mergeVertices(extruded, 1e-4);
  extruded.dispose();
  merged.computeVertexNormals();
  boxUv(merged);
  return merged;
}

/**
 * Plano w × h com UV em unidades de `tileX` × `tileY` metros: a textura repete no mesmo passo em toda
 * a sala, sem mexer no `repeat` da textura compartilhada.
 */
export function meterPlane(w: number, h: number, tileX: number, tileY = tileX): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(w, h);
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (uv.getX(i) * w) / tileX, (uv.getY(i) * h) / tileY);
  uv.needsUpdate = true;
  return geometry;
}

/** Sólido de revolução a partir de pares [raio, altura] (m). */
export function lathe(points: [number, number][], segments = 24): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}
