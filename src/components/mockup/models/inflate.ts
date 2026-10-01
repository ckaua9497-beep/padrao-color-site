import * as THREE from "three";

/*
 * Superfície "inflada" a partir de um contorno 2D: uma grade cobre o contorno, os triângulos de
 * fora são descartados, os vértices da borda são puxados para cima do contorno (silhueta lisa)
 * e cada vértice sobe conforme a distância até a borda. Frente (side = 1) e verso (side = -1)
 * se encontram em z = 0 na silhueta, formando uma peça fechada sem fresta — serve para
 * camiseta, almofada (inclusive coração), avental, bandana e cama pet.
 */

export type InflateOptions = {
  /** Altura máxima do volume (metade da espessura da peça). */
  height: number;
  /** Distância da borda até o volume ficar cheio (padrão: 35% do maior raio interno). */
  falloff?: number;
  /** Divisões da grade no lado maior. */
  resolution?: number;
  /** Amplitude das dobras de tecido (0 = liso). */
  folds?: number;
  side: 1 | -1;
};

function insidePolygon(x: number, y: number, polygon: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Ponto do contorno mais próximo de (x, y) e a distância até ele. */
function closestOnPolygon(x: number, y: number, polygon: THREE.Vector2[]) {
  let best = { x, y, distance: Infinity };
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[j];
    const b = polygon[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSq));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const distance = Math.hypot(x - px, y - py);
    if (distance < best.distance) best = { x: px, y: py, distance };
  }
  return best;
}

export function inflatedSurface(polygon: THREE.Vector2[], { height, falloff, resolution = 90, folds = 0, side }: InflateOptions): THREE.BufferGeometry {
  const box = new THREE.Box2().setFromPoints(polygon);
  const size = box.getSize(new THREE.Vector2());
  const cell = Math.max(size.x, size.y) / resolution;
  const nx = Math.ceil(size.x / cell) + 2;
  const ny = Math.ceil(size.y / cell) + 2;
  const x0 = box.min.x - cell;
  const y0 = box.min.y - cell;
  const at = (i: number, j: number) => j * (nx + 1) + i;

  const grid: { x: number; y: number; inside: boolean }[] = [];
  for (let j = 0; j <= ny; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const x = x0 + i * cell;
      const y = y0 + j * cell;
      grid.push({ x, y, inside: insidePolygon(x, y, polygon) });
    }
  }

  // Triângulos cujo centro fica dentro do contorno.
  const triangles: [number, number, number][] = [];
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i, j + 1);
      const d = at(i + 1, j + 1);
      for (const tri of [
        [a, b, d],
        [a, d, c],
      ] as [number, number, number][]) {
        const cx = (grid[tri[0]].x + grid[tri[1]].x + grid[tri[2]].x) / 3;
        const cy = (grid[tri[0]].y + grid[tri[1]].y + grid[tri[2]].y) / 3;
        if (insidePolygon(cx, cy, polygon)) triangles.push(tri);
      }
    }
  }

  // Vértices usados: os de fora vão para o contorno; os de dentro guardam a distância até a borda.
  const remap = new Map<number, number>();
  const points: { x: number; y: number; d: number }[] = [];
  for (const tri of triangles) {
    for (const index of tri) {
      if (remap.has(index)) continue;
      const g = grid[index];
      const near = closestOnPolygon(g.x, g.y, polygon);
      remap.set(index, points.length);
      points.push(g.inside && near.distance > cell * 0.35 ? { x: g.x, y: g.y, d: near.distance } : { x: near.x, y: near.y, d: 0 });
    }
  }

  const maxDistance = points.reduce((m, p) => Math.max(m, p.d), 0) || 1;
  const reach = falloff ?? maxDistance * 0.35;
  const positions = new Float32Array(points.length * 3);
  const uvs = new Float32Array(points.length * 2);
  points.forEach((p, k) => {
    const t = Math.min(1, p.d / reach);
    // Borda arredondada (quarto de círculo) e miolo quase plano.
    let z = height * Math.sqrt(1 - (1 - t) * (1 - t));
    if (folds) z += folds * t * (Math.sin(p.x * 5.1 + p.y * 1.7) * 0.6 + Math.sin(p.y * 7.3 - p.x * 2.2) * 0.4);
    positions[k * 3] = p.x;
    positions[k * 3 + 1] = p.y;
    positions[k * 3 + 2] = side * z;
    uvs[k * 2] = (p.x - box.min.x) / size.x;
    uvs[k * 2 + 1] = (p.y - box.min.y) / size.y;
  });

  const indices: number[] = [];
  for (const [a, b, c] of triangles) {
    const ra = remap.get(a) as number;
    const rb = remap.get(b) as number;
    const rc = remap.get(c) as number;
    // Frente olha para +z; o verso inverte a ordem para olhar para -z.
    if (side === 1) indices.push(ra, rb, rc);
    else indices.push(ra, rc, rb);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Contorno de um THREE.Shape como polígono (para inflatedSurface). */
export function shapePolygon(shape: THREE.Shape, divisions = 160): THREE.Vector2[] {
  const points = shape.getSpacedPoints(divisions);
  if (points.length > 1 && points[0].distanceTo(points[points.length - 1]) < 1e-6) points.pop();
  return points;
}
