/*
 * Linhas de LED do Quadro Acrílico com Led Neon (337), só na frente. O LED é uma fita contínua que acende numa cor só:
 * cada linha é um trecho contínuo, com uma cor. Para outra cor, o cliente finaliza a linha e começa a próxima.
 *   - Contorno automático: os laços do contorno da arte (contorno.ts, a LED_MARGEM_CM do desenho), um por ilha do
 *     desenho, cada um com a sua cor (`coresAuto`, do maior laço para o menor; sem cor própria, a padrão do produto).
 *     Arte sem transparência (foto inteira)
 *     ou sem desenho: o LED contorna a moldura do quadro.
 *   - Pincel: linhas desenhadas pelo cliente por cima da imagem enviada ou da arte criada no editor. Soltar o traço não
 *     termina a linha: o próximo traço continua dela (o LED vai reto do fim até onde o novo traço começa), até o cliente
 *     finalizar. Terminando perto do começo, a linha fecha. Ao finalizar, o traço feito à mão é interpretado e refeito
 *     limpo (led-forma.ts: reta, retângulo, círculo/elipse, polígono ou traço suavizado, com cantos no raio da fita); o
 *     traço como foi desenhado fica em `original` para o cliente voltar a ele.
 * Pontos em fração da área de arte: x da esquerda (0) para a direita (1) e y de cima (0) para baixo (1). O 3D
 * (models/signage.tsx), o editor 2D e o arquivo "Posição do Led" (product/contorno-arquivo.ts) usam linhasDeLed.
 * Puro e testado (led-linhas.test.ts).
 */

import { LED_BORDA_CM, polygonArea, type V2 } from "./contorno.ts";
import { interpretarTraco, reamostrar, suavizarMedia, type FormaLed } from "./led-forma.ts";

/** Cor do LED quando o produto não tem opção de cor (o rosa do neon padrão). */
export const LED_COR_PADRAO = "#ff4fd8";
/** Linha mais curta que isto não vira LED (clique solto, traço acidental), em cm. */
export const LED_LINHA_MIN_CM = 2;
/** Fim a esta distância do começo fecha a linha, em cm. */
export const LED_FECHAR_CM = 2;
/** Linhas do pincel por quadro. */
export const LED_MAX_LINHAS = 30;
/** Pontos de uma linha depois da simplificação (o traço do mouse vem com um ponto por evento). */
export const LED_MAX_PONTOS = 400;

/**
 * Uma linha do pincel. `tracos`: onde começa cada traço da linha em andamento (o "Desfazer" tira o último). `forma`: o que
 * a correção reconheceu; `original` (com `fechadaOriginal`): o traço como o cliente desenhou, antes da correção.
 */
export type LedLinha = { id: string; cor: string; pontos: V2[]; fechada: boolean; tracos?: number[]; forma?: FormaLed | null; original?: V2[] | null; fechadaOriginal?: boolean };

/** O que o cliente montou no LED do quadro (ArtSettings.led, só na frente). */
export type LedDesenho = {
  /** Contorno automático do desenho ligado (padrão). */
  auto: boolean;
  /** Cor de cada laço do contorno automático, do maior para o menor; sem cor própria, vale a padrão do produto. */
  coresAuto: string[];
  /** Linhas do pincel, na ordem em que foram desenhadas. */
  linhas: LedLinha[];
  /** Linha do pincel em andamento: o próximo traço continua nela. */
  emAndamento: string | null;
  /** Corrigir o traço ao finalizar a linha (led-forma.ts). Ausente = sim. */
  corrigir?: boolean;
};

export type Medida = { widthCm: number; heightCm: number };

/** Desenho sem nada além do contorno automático. Sempre o mesmo objeto (dependência estável). */
export const LED_DESENHO_PADRAO: LedDesenho = Object.freeze({ auto: true, coresAuto: [], linhas: [], emAndamento: null }) as LedDesenho;

export function desenhoDe(art: { led?: LedDesenho | null } | null | undefined): LedDesenho {
  return art?.led ?? LED_DESENHO_PADRAO;
}

const emCm = ([x, y]: V2, m: Medida): V2 => [x * m.widthCm, y * m.heightCm];
const distanciaCm = (a: V2, b: V2, m: Medida) => Math.hypot((a[0] - b[0]) * m.widthCm, (a[1] - b[1]) * m.heightCm);
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/** Comprimento da linha em cm (fechada: com o trecho de volta ao começo). */
export function comprimentoCm(pontos: readonly V2[], fechada: boolean, m: Medida): number {
  let total = 0;
  for (let i = 1; i < pontos.length; i += 1) total += distanciaCm(pontos[i - 1], pontos[i], m);
  if (fechada && pontos.length > 2) total += distanciaCm(pontos[pontos.length - 1], pontos[0], m);
  return total;
}

/** O LED fica no acrílico: o ponto vai para no mínimo `bordaCm` da borda do quadro. */
export function limitarNaPeca([x, y]: V2, m: Medida, bordaCm: number): V2 {
  const bx = m.widthCm > 0 ? bordaCm / m.widthCm : 0;
  const by = m.heightCm > 0 ? bordaCm / m.heightCm : 0;
  return [clamp(x, bx, 1 - bx), clamp(y, by, 1 - by)];
}

/** Ramer–Douglas–Peucker em cm: tira os pontos que se afastam menos de `tolCm` da reta entre os vizinhos que ficam. */
export function simplificar(pontos: readonly V2[], tolCm: number, m: Medida): V2[] {
  if (pontos.length <= 2) return pontos.slice();
  const cm = pontos.map((p) => emCm(p, m));
  const keep = new Uint8Array(pontos.length);
  keep[0] = 1;
  keep[pontos.length - 1] = 1;
  const stack: [number, number][] = [[0, pontos.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = cm[a];
    const [bx, by] = cm[b];
    const len = Math.hypot(bx - ax, by - ay);
    let far = -1;
    let farDist = tolCm;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = cm[i];
      const d = len < 1e-9 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
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
  return pontos.filter((_, i) => keep[i]);
}

/** Pontos colados (menos de 0,2 cm do anterior) saem; o traço fica dentro do acrílico. */
function limparTraco(traco: readonly V2[], m: Medida, bordaCm: number): V2[] {
  const out: V2[] = [];
  for (const p of traco) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const q = limitarNaPeca(p, m, bordaCm);
    const last = out[out.length - 1];
    if (!last || distanciaCm(last, q, m) >= 0.2) out.push(q);
  }
  return out;
}

/** Tira o tremido da mão de um traço (média móvel de ~0,75 cm, pontas no lugar), ainda sem mudar a forma. */
function estabilizar(pontos: V2[], m: Medida): V2[] {
  if (pontos.length < 5 || m.widthCm <= 0 || m.heightCm <= 0) return pontos;
  const cm = pontos.map(([x, y]): [number, number] => [x * m.widthCm, y * m.heightCm]);
  return suavizarMedia(reamostrar(cm, 0.25, false), 3, false).map(([x, y]): V2 => [x / m.widthCm, y / m.heightCm]);
}

/** Linha com no máximo LED_MAX_PONTOS (simplifica cada vez mais até caber). */
function caber(pontos: V2[], m: Medida): V2[] {
  let out = pontos;
  for (let tol = 0.05; out.length > LED_MAX_PONTOS && tol < 50; tol *= 1.6) out = simplificar(pontos, tol, m);
  return out;
}

/**
 * Traço novo do pincel (pontos em fração da área). Com uma linha em andamento, ele continua essa linha (mesma cor);
 * sem, começa uma linha nova na cor `cor`. Um clique solto vale como traço de um ponto: na linha em andamento, o LED vai
 * reto até ele. `novoId` só é chamado quando a linha é nova.
 */
export function adicionarTraco(d: LedDesenho, traco: readonly V2[], cor: string, m: Medida, bordaCm: number, novoId: () => string): LedDesenho {
  const pontos = estabilizar(limparTraco(traco, m, bordaCm), m);
  if (!pontos.length) return d;
  const atual = d.emAndamento ? d.linhas.find((l) => l.id === d.emAndamento) : undefined;
  if (atual) {
    const linhas = d.linhas.map((l) => (l === atual ? { ...l, pontos: caber([...l.pontos, ...pontos], m), tracos: [...(l.tracos ?? [0]), l.pontos.length] } : l));
    return { ...d, linhas };
  }
  if (d.linhas.length >= LED_MAX_LINHAS) return d;
  const linha: LedLinha = { id: novoId(), cor, pontos: caber(pontos, m), fechada: false, tracos: [0] };
  return { ...d, linhas: [...d.linhas, linha], emAndamento: linha.id };
}

/** A linha refeita pela correção (led-forma.ts), dentro do acrílico e com no máximo LED_MAX_PONTOS. */
function corrigida(pontos: V2[], fechada: boolean, m: Medida, bordaCm: number): { pontos: V2[]; fechada: boolean; forma: FormaLed } {
  const r = interpretarTraco(pontos, fechada, m);
  return { pontos: caber(r.pontos.map((p) => limitarNaPeca(p, m, bordaCm)), m), fechada: r.fechada, forma: r.forma };
}

/**
 * Finaliza a linha em andamento: curta demais (LED_LINHA_MIN_CM) sai; terminando a LED_FECHAR_CM do começo, fecha.
 * Com a correção ligada (padrão), o traço é interpretado e refeito limpo, e o desenhado fica em `original`; sem ela, só
 * simplificado (o LED segue curvas suaves, não o tremido do mouse).
 */
export function finalizarLinha(d: LedDesenho, m: Medida, bordaCm = LED_BORDA_CM): LedDesenho {
  const atual = d.emAndamento ? d.linhas.find((l) => l.id === d.emAndamento) : undefined;
  if (!atual) return d.emAndamento ? { ...d, emAndamento: null } : d;
  const total = comprimentoCm(atual.pontos, false, m);
  if (atual.pontos.length < 2 || total < LED_LINHA_MIN_CM) return { ...d, linhas: d.linhas.filter((l) => l !== atual), emAndamento: null };
  let pontos = atual.pontos;
  let fechada = false;
  if (pontos.length > 3 && total >= LED_FECHAR_CM * 3 && distanciaCm(pontos[0], pontos[pontos.length - 1], m) <= LED_FECHAR_CM) {
    fechada = true;
    pontos = pontos.slice(0, -1);
  }
  const desenhado = caber(simplificar(pontos, 0.08, m), m);
  const final: LedLinha =
    d.corrigir === false
      ? { id: atual.id, cor: atual.cor, pontos: desenhado, fechada }
      : { id: atual.id, cor: atual.cor, ...corrigida(desenhado, fechada, m, bordaCm), original: desenhado, fechadaOriginal: fechada };
  return { ...d, linhas: d.linhas.map((l) => (l === atual ? final : l)), emAndamento: null };
}

/** Volta a linha ao traço como o cliente desenhou (sem a correção). */
export function usarOriginal(d: LedDesenho, id: string): LedDesenho {
  return { ...d, linhas: d.linhas.map((l) => (l.id === id && l.original ? { id: l.id, cor: l.cor, pontos: l.original, fechada: l.fechadaOriginal ?? l.fechada, forma: null, original: l.original, fechadaOriginal: l.fechadaOriginal } : l)) };
}

/** Corrige (de novo) uma linha finalizada a partir do traço desenhado. */
export function corrigirLinha(d: LedDesenho, id: string, m: Medida, bordaCm = LED_BORDA_CM): LedDesenho {
  return {
    ...d,
    linhas: d.linhas.map((l) => {
      if (l.id !== id || l.id === d.emAndamento) return l;
      const desenhado = l.original ?? l.pontos;
      const fechadaOriginal = l.original ? (l.fechadaOriginal ?? l.fechada) : l.fechada;
      return { id: l.id, cor: l.cor, ...corrigida(desenhado, fechadaOriginal, m, bordaCm), original: desenhado, fechadaOriginal };
    }),
  };
}

/** Desfaz o último traço da linha em andamento; sem linha em andamento, apaga a última linha. */
export function desfazer(d: LedDesenho): LedDesenho {
  const atual = d.emAndamento ? d.linhas.find((l) => l.id === d.emAndamento) : undefined;
  if (atual) {
    const tracos = atual.tracos ?? [0];
    if (tracos.length > 1) {
      const ultimo = tracos[tracos.length - 1];
      return { ...d, linhas: d.linhas.map((l) => (l === atual ? { ...l, pontos: l.pontos.slice(0, ultimo), tracos: tracos.slice(0, -1) } : l)) };
    }
    return { ...d, linhas: d.linhas.filter((l) => l !== atual), emAndamento: null };
  }
  if (!d.linhas.length) return d;
  return { ...d, linhas: d.linhas.slice(0, -1) };
}

export function trocarCor(d: LedDesenho, id: string, cor: string): LedDesenho {
  return { ...d, linhas: d.linhas.map((l) => (l.id === id ? { ...l, cor } : l)) };
}

export function removerLinha(d: LedDesenho, id: string): LedDesenho {
  return { ...d, linhas: d.linhas.filter((l) => l.id !== id), emAndamento: d.emAndamento === id ? null : d.emAndamento };
}

/** Cor do laço `i` do contorno automático (sem cor própria, a padrão do produto: trocar um laço não pinta os outros). */
export function corDoContorno(d: LedDesenho, i: number, padrao: string): string {
  return d.coresAuto[i] ?? padrao;
}

/** Troca a cor do laço `i`, mantendo a cor que os anteriores mostravam. */
export function trocarCorDoContorno(d: LedDesenho, i: number, cor: string, padrao: string): LedDesenho {
  const coresAuto = Array.from({ length: Math.max(d.coresAuto.length, i + 1) }, (_, k) => (k === i ? cor : corDoContorno(d, k, padrao)));
  return { ...d, coresAuto };
}

/** Laços do maior para o menor (a ordem das cores não muda quando o desenho só anda na área). */
export function ordenarLacos(lacos: readonly V2[][]): V2[][] {
  return lacos
    .map((laco) => ({ laco, area: Math.abs(polygonArea(laco)) }))
    .sort((a, b) => b.area - a.area)
    .map(({ laco }) => laco);
}

/**
 * Moldura do quadro (arte sem desenho a contornar): retângulo arredondado a meia margem da borda, com a margem de
 * 9% do lado menor (3 a 6 cm) e cantos de 3 cm, como o 3D sempre mostrou. Pontos espaçados ~1 cm (até 240).
 */
export function molduraDoQuadro(m: Medida): V2[] {
  const margem = clamp(Math.min(m.widthCm, m.heightCm) * 0.09, 3, 6);
  const w = Math.max(m.widthCm - margem, 1);
  const h = Math.max(m.heightCm - margem, 1);
  const r = Math.min(3, w / 2, h / 2);
  const perimetro = 2 * (w + h - 4 * r) + 2 * Math.PI * r;
  const n = clamp(Math.round(perimetro), 24, 240);
  const pontos: V2[] = [];
  // Percorre o perímetro em passos iguais: retas e quartos de círculo nos cantos (sentido horário a partir do topo).
  const retas = [w - 2 * r, h - 2 * r, w - 2 * r, h - 2 * r];
  const arco = (Math.PI * r) / 2;
  const cantos: [number, number, number][] = [
    [w / 2 - r, -(h / 2 - r), -Math.PI / 2],
    [w / 2 - r, h / 2 - r, 0],
    [-(w / 2 - r), h / 2 - r, Math.PI / 2],
    [-(w / 2 - r), -(h / 2 - r), Math.PI],
  ];
  const inicio: [number, number, number, number][] = [
    [-(w / 2 - r), -h / 2, 1, 0],
    [w / 2, -(h / 2 - r), 0, 1],
    [w / 2 - r, h / 2, -1, 0],
    [-w / 2, h / 2 - r, 0, -1],
  ];
  for (let k = 0; k < n; k += 1) {
    let s = (k / n) * perimetro;
    for (let lado = 0; lado < 4; lado += 1) {
      if (s <= retas[lado]) {
        const [x0, y0, dx, dy] = inicio[lado];
        pontos.push([x0 + dx * s, y0 + dy * s]);
        break;
      }
      s -= retas[lado];
      if (s <= arco) {
        const [cx, cy, a0] = cantos[lado];
        const a = a0 + s / r;
        pontos.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        break;
      }
      s -= arco;
    }
  }
  return pontos.map(([x, y]): V2 => [0.5 + x / m.widthCm, 0.5 + y / m.heightCm]);
}

/** Uma linha de LED como vai para a produção, o 3D e o editor (numerada a partir de 1). */
export type LinhaDeLed = { n: number; origem: "contorno" | "moldura" | "pincel"; id: string; cor: string; pontos: V2[]; fechada: boolean; comprimentoCm: number };

/**
 * Todas as linhas de LED do quadro: o contorno automático (laços já em fração da área e ordenados; null ou `cheio` =
 * sem desenho a contornar, então a moldura) quando ligado, e as linhas do pincel (a em andamento também, para o cliente
 * ver o que está desenhando).
 */
export function linhasDeLed(d: LedDesenho, lacos: readonly V2[][] | null, cheio: boolean, m: Medida, corPadrao: string): LinhaDeLed[] {
  const out: LinhaDeLed[] = [];
  const push = (linha: Omit<LinhaDeLed, "n" | "comprimentoCm">) => out.push({ ...linha, n: out.length + 1, comprimentoCm: comprimentoCm(linha.pontos, linha.fechada, m) });
  if (d.auto) {
    if (lacos?.length && !cheio) lacos.forEach((pontos, i) => push({ origem: "contorno", id: `auto:${i}`, cor: corDoContorno(d, i, corPadrao), pontos, fechada: true }));
    else push({ origem: "moldura", id: "auto:0", cor: corDoContorno(d, 0, corPadrao), pontos: molduraDoQuadro(m), fechada: true });
  }
  for (const linha of d.linhas) if (linha.pontos.length >= 2) push({ origem: "pincel", id: linha.id, cor: linha.cor, pontos: linha.pontos, fechada: linha.fechada });
  return out;
}

/** Medida para o resumo: "38 cm", "1,42 m". */
export function medidaLed(cm: number): string {
  return cm >= 100 ? `${(Math.round(cm) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m` : `${Math.round(cm)} cm`;
}

const ORIGEM: Record<LinhaDeLed["origem"], string> = { contorno: "contorno", moldura: "moldura", pincel: "pincel" };

/** Resumo do carrinho e do pedido: "2 linhas, 1,80 m · 1 rosa (contorno, 1,42 m) · 2 azul (pincel, 38 cm)". */
export function resumoLed(linhas: readonly LinhaDeLed[], nome: (cor: string) => string): string {
  if (!linhas.length) return "sem LED";
  const total = linhas.reduce((s, l) => s + l.comprimentoCm, 0);
  const itens = linhas.map((l) => `${l.n} ${nome(l.cor).toLowerCase()} (${ORIGEM[l.origem]}, ${medidaLed(l.comprimentoCm)})`);
  return [`${linhas.length} ${linhas.length === 1 ? "linha" : "linhas"}, ${medidaLed(total)}`, ...itens].join(" · ");
}
