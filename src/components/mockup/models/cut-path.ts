// Contornos de corte dos gabaritos oficiais (src/data/templates.json, em mm, y para baixo) como formas do three.js
// em cm, centradas na caixa do corte e com y para cima. Só os comandos absolutos que os gabaritos usam: M, L, H, V,
// C, Q e Z.

import * as THREE from "three";

export type CutBox = { x: number; y: number; w: number; h: number };

/** Uma polilinha por subcaminho do `d`, em cm (curvas amostradas em `steps` pontos). */
export function cutPolylines(d: string, box: CutBox, steps = 12): THREE.Vector2[][] {
  const tokens = d.match(/[MLHVCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const at = (x: number, y: number) => new THREE.Vector2((x - cx) / 10, (cy - y) / 10);
  const paths: THREE.Vector2[][] = [];
  let current: THREE.Vector2[] = [];
  let x = 0;
  let y = 0;
  let command = "";
  let i = 0;
  const num = () => Number(tokens[i++]);
  const close = () => {
    if (current.length > 2) paths.push(current);
    current = [];
  };
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++].toUpperCase();
    if (command === "Z") {
      close();
      command = "";
      continue;
    }
    if (command === "M") {
      close();
      x = num();
      y = num();
      current.push(at(x, y));
      command = "L";
    } else if (command === "L" || command === "H" || command === "V") {
      if (command !== "V") x = num();
      if (command !== "H") y = num();
      current.push(at(x, y));
    } else if (command === "C" || command === "Q") {
      const p0 = new THREE.Vector2(x, y);
      const c1 = new THREE.Vector2(num(), num());
      const c2 = command === "C" ? new THREE.Vector2(num(), num()) : null;
      const end = new THREE.Vector2(num(), num());
      const curve = c2 ? new THREE.CubicBezierCurve(p0, c1, c2, end) : new THREE.QuadraticBezierCurve(p0, c1, end);
      for (let s = 1; s <= steps; s += 1) {
        const p = curve.getPoint(s / steps);
        current.push(at(p.x, p.y));
      }
      x = end.x;
      y = end.y;
    } else {
      i += 1;
    }
  }
  close();
  return paths.map(dedupe);
}

/** Tira pontos repetidos (os gabaritos trazem segmentos de comprimento zero) e o ponto final igual ao inicial. */
function dedupe(points: THREE.Vector2[]): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (const p of points) if (!out.length || out[out.length - 1].distanceTo(p) > 1e-4) out.push(p);
  if (out.length > 2 && out[0].distanceTo(out[out.length - 1]) < 1e-4) out.pop();
  return out;
}

/** Área com sinal (positiva no sentido anti-horário). */
export function signedArea(points: THREE.Vector2[]): number {
  let area = 0;
  for (let k = 0; k < points.length; k += 1) {
    const a = points[k];
    const b = points[(k + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * Forma de corte: o maior subcaminho é o contorno e os que caem dentro dele viram furos. `scale` estica o contorno
 * para outra medida do mesmo produto (x e y separados).
 */
export function cutShape(d: string, box: CutBox, scale: [number, number] = [1, 1]): THREE.Shape {
  const paths = cutPolylines(d, box).map((path) => path.map((p) => new THREE.Vector2(p.x * scale[0], p.y * scale[1])));
  paths.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const [outer, ...rest] = paths;
  const outline = signedArea(outer) < 0 ? [...outer].reverse() : outer;
  const shape = new THREE.Shape(outline);
  for (const hole of rest) shape.holes.push(new THREE.Path(signedArea(hole) > 0 ? [...hole].reverse() : hole));
  return shape;
}
