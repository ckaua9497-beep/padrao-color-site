/*
 * Contorno automático da arte (revisão da Padrão de 25/10/2026):
 *   - Lona s/ Acabamento c/ Corte Especial (41): a faca de corte segue o desenho, a FACA_MARGEM_CM dele, e vai no
 *     pedido como "Faca de Corte";
 *   - Quadro Acrílico com Led Neon (337): o tubo de LED contorna o desenho, a LED_MARGEM_CM dele, e o caminho vai
 *     como "Posição do Led".
 * O contorno sai do canal alfa da arte pintada sem fundo (PNG sem fundo, vetor ou texto): o campo de distância
 * engrossa o desenho pela margem e o marching squares traça a borda. Arte sem transparência (foto inteira) dá a
 * borda da peça (`cheio`): não há desenho para seguir.
 *
 * O mesmo traçado recorta o acrílico do LED neon (models/signage.tsx). Puro e testado (contorno.test.ts).
 */

export type V2 = [number, number];

/** Margem do corte em volta do desenho, em cm (a confirmar com a produção da Padrão). */
export const FACA_MARGEM_CM = 1;
/** Distância do tubo de LED até o desenho, em cm. */
export const LED_MARGEM_CM = 1.5;
/** O tubo fica no acrílico: no mínimo a esta distância da borda do quadro, em cm. */
export const LED_BORDA_CM = 1.2;

export type Contorno = {
  tipo: "faca" | "led";
  /** Tipo de anexo do arquivo gerado (customizacao.ts). */
  anexo: "Faca de Corte" | "Posição do Led";
  margemCm: number;
  /** Distância mínima do caminho até a borda da peça, em cm (o desenho que sangra não leva o caminho para fora). */
  bordaCm: number;
  titulo: string;
  texto: string;
};

const FACA: Contorno = {
  tipo: "faca",
  anexo: "Faca de Corte",
  margemCm: FACA_MARGEM_CM,
  bordaCm: 0,
  titulo: "Corte no formato da arte",
  texto: `A faca de corte é feita automaticamente: segue o contorno do desenho a ${FACA_MARGEM_CM} cm dele. Envie PNG sem fundo, vetor ou escreva o texto; arte com fundo é cortada reta, na medida.`,
};

const LED: Contorno = {
  tipo: "led",
  anexo: "Posição do Led",
  margemCm: LED_MARGEM_CM,
  bordaCm: LED_BORDA_CM,
  titulo: "LED em volta do desenho",
  texto: `O caminho do LED é feito automaticamente: contorna o desenho a ${String(LED_MARGEM_CM).replace(".", ",")} cm dele. Envie PNG sem fundo, vetor ou escreva o texto; arte com fundo ganha o LED em volta do quadro.`,
};

/** O produto tem contorno automático? `name` sem acento e minúsculo. Sempre o mesmo objeto (dependência estável). */
export function contornoDo({ kind, variant, name }: { kind: string; variant: string | null; name: string }): Contorno | null {
  if (kind === "banner" && /\bcorte especial\b/.test(name)) return FACA;
  if (kind === "neon" && variant === "frame") return LED;
  return null;
}

/**
 * Contornos de fora da arte engrossada `growPx` pixels (a margem), em pixels do canvas, já suavizados e a no mínimo
 * `insetPx` da borda do canvas. Ilhas muito menores que a maior (1% da área) ficam de fora. null sem nada pintado.
 */
export function contornoDaArte(rgba: Uint8ClampedArray, W: number, H: number, growPx: number, insetPx = 0): { loops: V2[][]; cheio: boolean } | null {
  const dist = distanceField(rgba, W, H);
  if (!dist) return null;
  const inside = new Uint8Array(W * H);
  let filled = 0;
  for (let i = 0; i < inside.length; i += 1) {
    inside[i] = dist[i] <= growPx ? 1 : 0;
    filled += inside[i];
  }
  const raw = traceLoops(inside, W, H).filter((loop) => Math.abs(polygonArea(loop)) >= 6);
  // Só os contornos de fora: furos e ilhas dentro de furos ficam dentro do corte.
  const outer = raw.filter((loop, i) => raw.every((other, j) => j === i || !insidePolygon(loop[0], other)));
  const biggest = Math.max(0, ...outer.map((loop) => Math.abs(polygonArea(loop))));
  const loops = outer
    .filter((loop) => Math.abs(polygonArea(loop)) >= biggest * 0.01)
    .map((loop) => smoothLoop(loop, 1.1).map(([x, y]): V2 => [clamp(x, insetPx - 0.5, W - 0.5 - insetPx), clamp(y, insetPx - 0.5, H - 0.5 - insetPx)]))
    .filter((loop) => loop.length >= 6);
  if (!loops.length) return null;
  return { loops, cheio: filled >= inside.length * 0.98 };
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/** Caminho SVG ("M … L … Z") dos laços, com cada ponto passado por `map` (pixels → unidade do arquivo). */
export function caminhoSvg(loops: readonly V2[][], map: (p: V2) => V2): string {
  const n = (v: number) => String(Math.round(v * 100) / 100);
  return loops
    .map((loop) => {
      const points = loop.map(map);
      return `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;
    })
    .join("");
}

/** Distância (px, métrica chanfrada 1/√2) de cada pixel até o pixel pintado (alfa ≥ 48) mais próximo; null sem nada pintado. */
export function distanceField(data: Uint8ClampedArray, W: number, H: number): Float32Array | null {
  const d = new Float32Array(W * H);
  let any = false;
  for (let i = 0; i < d.length; i += 1) {
    if (data[i * 4 + 3] >= 48) any = true;
    d[i] = data[i * 4 + 3] >= 48 ? 0 : 1e9;
  }
  if (!any) return null;
  const D = Math.SQRT2;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - W] + 1);
        if (x > 0) v = Math.min(v, d[i - W - 1] + D);
        if (x < W - 1) v = Math.min(v, d[i - W + 1] + D);
      }
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y -= 1) {
    for (let x = W - 1; x >= 0; x -= 1) {
      const i = y * W + x;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < H - 1) {
        v = Math.min(v, d[i + W] + 1);
        if (x < W - 1) v = Math.min(v, d[i + W + 1] + D);
        if (x > 0) v = Math.min(v, d[i + W - 1] + D);
      }
      d[i] = v;
    }
  }
  return d;
}

/** Contornos de uma máscara binária (marching squares), em pixels. Só fecha laços completos. */
export function traceLoops(inside: Uint8Array, W: number, H: number): V2[][] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? inside[y * W + x] : 0);
  const wp = W + 2;
  const hEdge = (x: number, y: number) => ((y + 1) * wp + (x + 1)) * 2;
  const vEdge = (x: number, y: number) => hEdge(x, y) + 1;
  const positions = new Map<number, V2>();
  const links = new Map<number, number[]>();
  const link = (a: number, pa: V2, b: number, pb: V2) => {
    positions.set(a, pa);
    positions.set(b, pb);
    const la = links.get(a);
    if (la) la.push(b);
    else links.set(a, [b]);
    const lb = links.get(b);
    if (lb) lb.push(a);
    else links.set(b, [a]);
  };
  for (let y = -1; y < H; y += 1) {
    for (let x = -1; x < W; x += 1) {
      const code = (at(x, y) << 3) | (at(x + 1, y) << 2) | (at(x + 1, y + 1) << 1) | at(x, y + 1);
      if (code === 0 || code === 15) continue;
      const T: [number, V2] = [hEdge(x, y), [x + 0.5, y]];
      const R: [number, V2] = [vEdge(x + 1, y), [x + 1, y + 0.5]];
      const B: [number, V2] = [hEdge(x, y + 1), [x + 0.5, y + 1]];
      const L: [number, V2] = [vEdge(x, y), [x, y + 0.5]];
      const pairs: [[number, V2], [number, V2]][] = [];
      switch (code) {
        case 1:
        case 14:
          pairs.push([L, B]);
          break;
        case 2:
        case 13:
          pairs.push([B, R]);
          break;
        case 3:
        case 12:
          pairs.push([L, R]);
          break;
        case 4:
        case 11:
          pairs.push([T, R]);
          break;
        case 6:
        case 9:
          pairs.push([T, B]);
          break;
        case 7:
        case 8:
          pairs.push([L, T]);
          break;
        case 5:
          pairs.push([L, T], [B, R]);
          break;
        case 10:
          pairs.push([T, R], [L, B]);
          break;
      }
      for (const [a, b] of pairs) link(a[0], a[1], b[0], b[1]);
    }
  }
  const visited = new Set<number>();
  const loops: V2[][] = [];
  for (const start of links.keys()) {
    if (visited.has(start)) continue;
    const loop: V2[] = [];
    let prev = -1;
    let current: number | undefined = start;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const p = positions.get(current);
      if (p) loop.push(p);
      const from: number = prev;
      const next: number | undefined = (links.get(current) ?? []).find((n) => n !== from && !visited.has(n));
      prev = current;
      current = next;
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

export function polygonArea(loop: V2[]) {
  let area = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % loop.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

export function insidePolygon([px, py]: V2, loop: V2[]) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/** Arredonda o contorno em escada (Chaikin) e tira pontos colados. */
export function smoothLoop(loop: V2[], minStep: number): V2[] {
  let points = loop;
  for (let pass = 0; pass < 2; pass += 1) {
    const next: V2[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    points = next;
  }
  const kept: V2[] = [];
  for (const p of points) {
    const last = kept[kept.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minStep) kept.push(p);
  }
  return kept;
}

