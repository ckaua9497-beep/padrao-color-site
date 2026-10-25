/*
 * Correção do traço do pincel de LED (led-linhas.ts): o traço feito à mão sai tremido, e a fita de LED não faz curva
 * mais fechada que LED_RAIO_CM. Ao finalizar a linha, o site interpreta o que o cliente quis desenhar e refaz limpo:
 *   - reta: o traço aberto quase reto vira um segmento;
 *   - elipse / círculo: o laço fechado que segue uma elipse (eixos retos quando quase retos; círculo quando os eixos
 *     são quase iguais);
 *   - retângulo: o laço fechado que segue os quatro lados de um retângulo (alinhado quando quase alinhado), com cantos
 *     no raio da fita;
 *   - polígono: o laço fechado de 3 a 8 lados retos, com cantos no raio da fita;
 *   - livre: o resto, sem o tremido (média móvel), com menos pontos e os cantos arredondados no raio da fita.
 * Tudo em cm (a área da arte pode ser retangular); entra e sai em fração da área. Puro e testado (led-forma.test.ts).
 */

import type { V2 } from "./contorno.ts";

/** Raio mínimo de curva da fita de LED neon, em cm (valor provisório, a confirmar com a produção da Padrão). */
export const LED_RAIO_CM = 2;

export type FormaLed = "reta" | "retangulo" | "elipse" | "circulo" | "poligono" | "livre";

export const FORMA_LABEL: Record<FormaLed, string> = {
  reta: "reta",
  retangulo: "retângulo",
  elipse: "elipse",
  circulo: "círculo",
  poligono: "polígono",
  livre: "traço suavizado",
};

export type Medida = { widthCm: number; heightCm: number };
export type Interpretacao = { forma: FormaLed; pontos: V2[]; fechada: boolean };

type P = [number, number];

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const GRAU = Math.PI / 180;

export function comprimento(pts: readonly P[], fechada: boolean): number {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) total += dist(pts[i - 1], pts[i]);
  if (fechada && pts.length > 2) total += dist(pts[pts.length - 1], pts[0]);
  return total;
}

/** Pontos a cada `passo` cm ao longo do traço (mantém o primeiro e, no aberto, o último). */
export function reamostrar(pts: readonly P[], passo: number, fechada: boolean): P[] {
  if (pts.length < 2) return pts.slice();
  const caminho = fechada ? [...pts, pts[0]] : pts.slice();
  const out: P[] = [caminho[0]];
  let falta = passo;
  for (let i = 1; i < caminho.length; i += 1) {
    let a = caminho[i - 1];
    const b = caminho[i];
    let seg = dist(a, b);
    while (seg >= falta) {
      const t = falta / seg;
      a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(a);
      seg -= falta;
      falta = passo;
    }
    falta -= seg;
  }
  if (fechada) {
    if (out.length > 2 && dist(out[out.length - 1], out[0]) < passo * 0.5) out.pop();
  } else if (dist(out[out.length - 1], caminho[caminho.length - 1]) > 1e-9) out.push(caminho[caminho.length - 1]);
  return out;
}

/** Média móvel de `janela` pontos para tirar o tremido da mão (no aberto, as pontas ficam onde estavam). */
export function suavizarMedia(pts: readonly P[], janela: number, fechada: boolean): P[] {
  const n = pts.length;
  const k = Math.max(0, Math.floor(janela / 2));
  if (n < 3 || k === 0) return pts.slice();
  return pts.map((p, i): P => {
    if (!fechada && (i === 0 || i === n - 1)) return p;
    let sx = 0;
    let sy = 0;
    let c = 0;
    for (let j = -k; j <= k; j += 1) {
      let idx = i + j;
      if (fechada) idx = ((idx % n) + n) % n;
      else if (idx < 0 || idx >= n) continue;
      sx += pts[idx][0];
      sy += pts[idx][1];
      c += 1;
    }
    return [sx / c, sy / c];
  });
}

function distSegmento(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer–Douglas–Peucker (aberto). */
export function rdp(pts: readonly P[], tol: number): P[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    let far = -1;
    let farDist = tol;
    for (let i = a + 1; i < b; i += 1) {
      const d = distSegmento(pts[i], pts[a], pts[b]);
      if (d > farDist) {
        far = i;
        farDist = d;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** RDP num laço fechado: corta no ponto mais longe do primeiro e simplifica as duas metades. */
export function rdpFechado(pts: readonly P[], tol: number): P[] {
  if (pts.length <= 3) return pts.slice();
  let far = 0;
  for (let i = 1; i < pts.length; i += 1) if (dist(pts[i], pts[0]) > dist(pts[far], pts[0])) far = i;
  const a = rdp([...pts.slice(0, far + 1)], tol);
  const b = rdp([...pts.slice(far), pts[0]], tol);
  return [...a, ...b.slice(1, -1)];
}

/** Distância média (e o pior caso) dos pontos até o caminho `forma`. */
function erroAte(pts: readonly P[], forma: readonly P[], fechada: boolean): { medio: number; max: number } {
  let soma = 0;
  let max = 0;
  const segs = fechada ? forma.length : forma.length - 1;
  for (const p of pts) {
    let melhor = Infinity;
    for (let i = 0; i < segs; i += 1) melhor = Math.min(melhor, distSegmento(p, forma[i], forma[(i + 1) % forma.length]));
    soma += melhor;
    max = Math.max(max, melhor);
  }
  return { medio: soma / Math.max(1, pts.length), max };
}

/**
 * Cantos arredondados no raio `raio` (o arco cabe na metade dos lados vizinhos). Vértice quase reto (vira menos que
 * `anguloMin`) fica como está.
 */
export function arredondarCantos(pts: readonly P[], raio: number, fechada: boolean, anguloMin = 12 * GRAU): P[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const out: P[] = [];
  for (let i = 0; i < n; i += 1) {
    const ponta = !fechada && (i === 0 || i === n - 1);
    if (ponta) {
      out.push(pts[i]);
      continue;
    }
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const la = dist(a, b);
    const lc = dist(b, c);
    if (la < 1e-6 || lc < 1e-6) continue;
    const u: P = [(a[0] - b[0]) / la, (a[1] - b[1]) / la];
    const v: P = [(c[0] - b[0]) / lc, (c[1] - b[1]) / lc];
    const cos = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]));
    const theta = Math.acos(cos);
    if (Math.PI - theta < anguloMin) {
      out.push(b);
      continue;
    }
    const tan = Math.tan(theta / 2);
    // Distância do vértice até onde o arco começa; limitada pela metade dos lados.
    let t = raio / tan;
    t = Math.min(t, la * 0.5, lc * 0.5);
    const r = t * tan;
    const t1: P = [b[0] + u[0] * t, b[1] + u[1] * t];
    const t2: P = [b[0] + v[0] * t, b[1] + v[1] * t];
    const bis: P = [u[0] + v[0], u[1] + v[1]];
    const lb = Math.hypot(bis[0], bis[1]) || 1;
    const dc = r / Math.sin(theta / 2);
    const centro: P = [b[0] + (bis[0] / lb) * dc, b[1] + (bis[1] / lb) * dc];
    const a1 = Math.atan2(t1[1] - centro[1], t1[0] - centro[0]);
    let a2 = Math.atan2(t2[1] - centro[1], t2[0] - centro[0]);
    let delta = a2 - a1;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    a2 = a1 + delta;
    const passos = Math.max(2, Math.ceil(Math.abs(delta) / (10 * GRAU)));
    for (let s = 0; s <= passos; s += 1) {
      const ang = a1 + (delta * s) / passos;
      out.push([centro[0] + r * Math.cos(ang), centro[1] + r * Math.sin(ang)]);
    }
  }
  return out;
}

/** Casco convexo (cadeia monótona). */
export function casco(pts: readonly P[]): P[] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P[] = [];
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const p = s[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Ângulo perto de um múltiplo de 90° (até `tol`) vira esse múltiplo. */
function alinhar(ang: number, tol = 5 * GRAU): number {
  const reto = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
  return Math.abs(ang - reto) <= tol ? reto : ang;
}

const girar = (p: P, c: P, cos: number, sin: number): P => [c[0] + p[0] * cos - p[1] * sin, c[1] + p[0] * sin + p[1] * cos];

/** Elipse que melhor segue o laço (eixos pela análise de componentes, raios pelos extremos), com o erro relativo. */
function ajustarElipse(pts: readonly P[]): { centro: P; a: number; b: number; ang: number; medio: number; p90: number; cobertura: number } {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const ang = alinhar(0.5 * Math.atan2(2 * sxy, sxx - syy));
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const loc = pts.map(([x, y]): P => [(x - mx) * cos + (y - my) * sin, -(x - mx) * sin + (y - my) * cos]);
  const xs = loc.map((p) => p[0]);
  const ys = loc.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  // Os extremos do tremido incham a elipse: a escala vem da mediana dos raios normalizados.
  const a0 = Math.max((x1 - x0) / 2, 1e-6);
  const b0 = Math.max((y1 - y0) / 2, 1e-6);
  const raios = loc.map(([x, y]) => Math.hypot((x - cx) / a0, (y - cy) / b0)).sort((p, q) => p - q);
  const escala = raios[Math.floor(raios.length / 2)] || 1;
  const a = a0 * escala;
  const b = b0 * escala;
  const erros = loc.map(([x, y]) => Math.abs(Math.hypot((x - cx) / a, (y - cy) / b) - 1)).sort((p, q) => p - q);
  // Em quantos dos 12 setores em volta do centro o traço passa (meia volta não é elipse).
  const setores = new Set(loc.map(([x, y]) => Math.floor(((Math.atan2((y - cy) / b, (x - cx) / a) + Math.PI) / (2 * Math.PI)) * 12) % 12));
  return {
    centro: girar([cx, cy], [mx, my], cos, sin),
    a,
    b,
    ang,
    medio: erros.reduce((s, e) => s + e, 0) / erros.length,
    p90: erros[Math.floor(erros.length * 0.9)] ?? 1,
    cobertura: setores.size / 12,
  };
}

function pontosElipse(centro: P, a: number, b: number, ang: number): P[] {
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const n = Math.max(32, Math.min(160, Math.round((Math.PI * (a + b)) / 0.5)));
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI;
    return girar([a * Math.cos(t), b * Math.sin(t)], centro, cos, sin);
  });
}

/** Retângulo de menor área em volta do laço (uma direção por lado do casco) e o erro até a borda dele. */
function ajustarRetangulo(pts: readonly P[]): { centro: P; w: number; h: number; ang: number; medio: number; p90: number; lados: number } | null {
  const h = casco(pts);
  if (h.length < 3) return null;
  let melhor: { area: number; ang: number; x0: number; x1: number; y0: number; y1: number } | null = null;
  for (let i = 0; i < h.length; i += 1) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of h) {
      const u = x * cos + y * sin;
      const v = -x * sin + y * cos;
      x0 = Math.min(x0, u);
      x1 = Math.max(x1, u);
      y0 = Math.min(y0, v);
      y1 = Math.max(y1, v);
    }
    const area = (x1 - x0) * (y1 - y0);
    if (!melhor || area < melhor.area) melhor = { area, ang, x0, x1, y0, y1 };
  }
  if (!melhor) return null;
  // Quase alinhado com a área: endireita e mede de novo nesse ângulo.
  const ang = alinhar(melhor.ang);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const loc = pts.map(([x, y]): P => [x * cos + y * sin, -x * sin + y * cos]);
  const xs = loc.map((p) => p[0]);
  const ys = loc.map((p) => p[1]);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Os extremos do tremido incham o retângulo: cada lado vai para a mediana dos pontos mais perto dele.
  const lado: number[][] = [[], [], [], []];
  for (const [x, y] of loc) {
    const d = [Math.abs(y - y0), Math.abs(y1 - y), Math.abs(x - x0), Math.abs(x1 - x)];
    const k = d.indexOf(Math.min(...d));
    lado[k].push(k < 2 ? y : x);
  }
  const mediana = (vals: number[], padrao: number) => (vals.length ? [...vals].sort((p, q) => p - q)[Math.floor(vals.length / 2)] : padrao);
  [y0, y1, x0, x1] = [mediana(lado[0], y0), mediana(lado[1], y1), mediana(lado[2], x0), mediana(lado[3], x1)];
  const w = x1 - x0;
  const hh = y1 - y0;
  const menor = Math.max(Math.min(w, hh), 1e-6);
  const erros = loc
    .map(([x, y]) => {
      const dx = Math.min(Math.abs(x - x0), Math.abs(x1 - x));
      const dy = Math.min(Math.abs(y - y0), Math.abs(y1 - y));
      return Math.min(dx, dy) / menor;
    })
    .sort((p, q) => p - q);
  // Os quatro lados: cada um precisa de traço ao longo de pelo menos metade dele.
  const perto = 0.15 * menor;
  const cobertura = (sel: (p: P) => boolean, eixo: 0 | 1, tamanho: number) => {
    const vals = loc.filter(sel).map((p) => p[eixo]);
    return vals.length ? (Math.max(...vals) - Math.min(...vals)) / Math.max(tamanho, 1e-6) : 0;
  };
  const lados = [
    cobertura((p) => Math.abs(p[1] - y0) <= perto, 0, w),
    cobertura((p) => Math.abs(p[1] - y1) <= perto, 0, w),
    cobertura((p) => Math.abs(p[0] - x0) <= perto, 1, hh),
    cobertura((p) => Math.abs(p[0] - x1) <= perto, 1, hh),
  ].filter((c) => c >= 0.5).length;
  return {
    centro: girar([(x0 + x1) / 2, (y0 + y1) / 2], [0, 0], cos, sin),
    w,
    h: hh,
    ang,
    medio: erros.reduce((s, e) => s + e, 0) / erros.length,
    p90: erros[Math.floor(erros.length * 0.9)] ?? 1,
    lados,
  };
}

function cantosDoRetangulo(centro: P, w: number, h: number, ang: number): P[] {
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return (
    [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ] as P[]
  ).map((p) => girar(p, centro, cos, sin));
}

/**
 * Interpreta o traço do pincel (pontos em fração da área) e devolve a forma limpa. `fechada`: a linha já fechou (o fim
 * voltou perto do começo); um laço que termina um pouco mais longe também fecha (até 8% do tamanho do traço).
 */
export function interpretarTraco(pontos: readonly V2[], fechada: boolean, m: Medida, raio = LED_RAIO_CM): Interpretacao {
  const W = Math.max(m.widthCm, 1e-6);
  const H = Math.max(m.heightCm, 1e-6);
  const cm = pontos.map(([x, y]): P => [x * W, y * H]);
  const fracao = (pts: readonly P[]): V2[] => pts.map(([x, y]): V2 => [x / W, y / H]);
  if (cm.length < 2) return { forma: "livre", pontos: pontos.slice(), fechada };
  const xs = cm.map((p) => p[0]);
  const ys = cm.map((p) => p[1]);
  const tamanho = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (tamanho < 1) return { forma: "livre", pontos: pontos.slice(), fechada };

  // Fecha o laço que volta perto do começo, mesmo que a linha não tenha fechado sozinha.
  const fecha = fechada || (cm.length > 4 && comprimento(cm, false) > tamanho * 1.8 && dist(cm[0], cm[cm.length - 1]) <= Math.max(2, tamanho * 0.08));
  // Sem o tremido: pontos a cada 0,25 cm e média móvel de ~0,8 cm (no máximo 3% do tamanho).
  const passo = 0.25;
  const base = suavizarMedia(reamostrar(cm, passo, fecha), Math.round(Math.min(0.8, tamanho * 0.03) / passo) * 2 + 1, fecha);

  if (!fecha) {
    const a = base[0];
    const b = base[base.length - 1];
    let desvio = 0;
    for (const p of base) desvio = Math.max(desvio, distSegmento(p, a, b));
    if (desvio <= Math.max(0.5, dist(a, b) * 0.04)) return { forma: "reta", pontos: fracao([a, b]), fechada: false };
    const simples = rdp(base, Math.max(0.35, tamanho * 0.02));
    return { forma: "livre", pontos: fracao(reamostrar(arredondarCantos(simples, raio, false), 0.4, false)), fechada: false };
  }

  const candidatos: { forma: FormaLed; erro: number; pts: P[] }[] = [];
  const el = ajustarElipse(base);
  if (el.cobertura >= 0.9 && el.medio < 0.06 && el.p90 < 0.13) {
    const circulo = Math.abs(el.a - el.b) / Math.max(el.a, el.b) < 0.1;
    const r = (el.a + el.b) / 2;
    candidatos.push({ forma: circulo ? "circulo" : "elipse", erro: el.medio, pts: circulo ? pontosElipse(el.centro, r, r, 0) : pontosElipse(el.centro, el.a, el.b, el.ang) });
  }
  const re = ajustarRetangulo(base);
  if (re && re.lados === 4 && re.medio < 0.05 && re.p90 < 0.11 && Math.min(re.w, re.h) >= 1) {
    candidatos.push({ forma: "retangulo", erro: re.medio, pts: arredondarCantos(cantosDoRetangulo(re.centro, re.w, re.h, re.ang), raio, true) });
  }
  if (candidatos.length) {
    candidatos.sort((p, q) => p.erro - q.erro);
    return { forma: candidatos[0].forma, pontos: fracao(candidatos[0].pts), fechada: true };
  }
  // Polígono de poucos lados retos (triângulo, losango, estrela simples…).
  const poligono = rdpFechado(base, Math.max(0.5, tamanho * 0.04));
  if (poligono.length >= 3 && poligono.length <= 8 && erroAte(base, poligono, true).medio <= tamanho * 0.02) {
    return { forma: "poligono", pontos: fracao(arredondarCantos(poligono, raio, true)), fechada: true };
  }
  const simples = rdpFechado(base, Math.max(0.35, tamanho * 0.02));
  return { forma: "livre", pontos: fracao(reamostrar(arredondarCantos(simples, raio, true), 0.4, true)), fechada: true };
}
