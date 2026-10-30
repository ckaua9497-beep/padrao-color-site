/*
 * Preto do texto em K100 (revisão da Padrão de 29/10/2026: "trocar a configuração da cor preta da letra para C:0 M:0 Y:0
 * K:100"). O arquivo de impressão é uma imagem RGB, e o RIP da gráfica converte o preto RGB num preto de quatro cores
 * (preto composto). Por isso o texto preto sai da imagem e vai por cima, numa camada só de preto (K) do CMYK
 * (gabarito/print-file.ts, com a separação feita no art.ts, `paintArt(..., { preto })`).
 */

/** Preto do texto: cor neutra e bem escura (o "Preto" da paleta, a tinta dos modelos e quase-pretos como #141414). */
const MAX_CANAL = 40;
const MAX_DESVIO = 12;

/**
 * Opacidade (0–1) com que a cor de texto vai em K100, ou null quando ela não é preta. Lê as formas que o canvas devolve
 * em fillStyle/strokeStyle ("#rrggbb" e "rgba(r, g, b, a)") e também "#rgb" e "rgb(r, g, b)". Gradiente e padrão: null.
 */
export function opacidadeDoPreto(cor: unknown): number | null {
  if (typeof cor !== "string") return null;
  const texto = cor.trim().toLowerCase();
  let r: number;
  let g: number;
  let b: number;
  let a = 1;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(texto)?.[1];
  if (hex) {
    const longo = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    r = Number.parseInt(longo.slice(0, 2), 16);
    g = Number.parseInt(longo.slice(2, 4), 16);
    b = Number.parseInt(longo.slice(4, 6), 16);
    if (longo.length === 8) a = Number.parseInt(longo.slice(6, 8), 16) / 255;
  } else {
    const partes = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(texto);
    if (!partes) return null;
    [r, g, b] = [partes[1], partes[2], partes[3]].map(Number);
    if (partes[4] !== undefined) a = Number(partes[4]);
  }
  if (![r, g, b, a].every(Number.isFinite) || a <= 0) return null;
  const maior = Math.max(r, g, b);
  if (maior > MAX_CANAL || maior - Math.min(r, g, b) > MAX_DESVIO) return null;
  return Math.min(1, a);
}
