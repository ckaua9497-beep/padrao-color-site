/*
 * Quadro Mosaico (136): as placas como no gabarito oficial e na foto do produto (revisão da Padrão de 29/10/2026: "o
 * modelo 3D não está de acordo"). Placas lado a lado, todas da mesma largura, centradas na altura e mais baixas para as
 * pontas, com vão entre elas. A arte é uma só e atravessa todas (template-curation.json, "quadro-mosaico"):
 *   - 1,0 × 1,0 m: 3 placas de 33 cm, alturas 75 / 100 / 75 cm, vão de 2,3 cm;
 *   - 1,5 × 1,0 m: 5 placas de 30 cm, alturas 55 / 75 / 100 / 75 / 55 cm, vão de 3 cm;
 *   - 2,0 × 1,0 m: 5 placas de 40 cm, alturas 60 / 80 / 100 / 80 / 60 cm, vão de 3 cm.
 */

/** Placa do mosaico: centro e tamanho em cm, com a origem no centro do conjunto (y para cima). */
export type PlacaMosaico = { x: number; y: number; w: number; h: number };

export type Mosaico = { placas: PlacaMosaico[]; larguraCm: number; alturaCm: number };

/** Altura de cada placa (fração da altura do formato), da ponta esquerda à direita. */
function alturas(larguraCm: number): number[] {
  if (larguraCm <= 110) return [0.75, 1, 0.75];
  if (larguraCm <= 175) return [0.55, 0.75, 1, 0.75, 0.55];
  return [0.6, 0.8, 1, 0.8, 0.6];
}

/** Placas do formato (largura × altura do "Formato" em cm) e o tamanho do conjunto com os vãos. */
export function placasDoMosaico(larguraCm: number, alturaCm: number): Mosaico {
  const largura = larguraCm > 0 ? larguraCm : 100;
  const altura = alturaCm > 0 ? alturaCm : 100;
  const fracoes = alturas(largura);
  const n = fracoes.length;
  const placa = Math.round(largura / n);
  const vao = n === 3 ? 2.3 : 3;
  const total = n * placa + (n - 1) * vao;
  const placas = fracoes.map((fracao, i) => ({ x: -total / 2 + placa / 2 + i * (placa + vao), y: 0, w: placa, h: Math.round(altura * fracao * 10) / 10 }));
  return { placas, larguraCm: total, alturaCm: altura };
}
