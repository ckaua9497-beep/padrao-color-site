/*
 * Processo de produção que limita a arte (revisão da Padrão de 25/10/2026, "W2P"):
 * - "pb": Impressão P&B (155/156) e toda variação 1/0 ou 1/1 "tons de cinza" (a Pulseira em Tyvek): sem arte colorida.
 * - "laser": Copo Térmico (186), gravado a laser: a arte sai num tom só (o laser queima a pintura e revela o metal).
 * - "talhamento": Tábuas (139/140), talhadas na madeira com broca: só texto e imagem vetorial.
 * - "dtf": Folha DTF Têxtil (149) e DTF UV (379): aplicação localizada, imagens sem fundo; a folha não é preenchida.
 *
 * Puro e testado (processo.test.ts): sem JSX, imports com extensão .ts.
 */

import type { Selection } from "./pricing.ts";

export type Processo = "pb" | "laser" | "talhamento" | "dtf";

export type ProcessoInput = {
  kind: string;
  /** Nome do produto (sem acento, minúsculo, como o normalizeName do mockup). */
  name: string;
  selection: Selection;
};

/** Valor da opção de cor/impressão ("1/0 (Tons de Cinza só frente)"), ou "". */
function corDa(selection: Selection): string {
  const entry = Object.entries(selection).find(([key]) => /(^|\s|-)(cor(es)?\b|impress)/i.test(key));
  return entry?.[1] ?? "";
}

export function processoDa({ kind, name, selection }: ProcessoInput): Processo | null {
  if (/\bdtf\b/.test(name)) return "dtf";
  if (kind === "tumbler" && /\bcopo termico\b/.test(name)) return "laser";
  if (kind === "board" && /\btabua/.test(name)) return "talhamento";
  const cor = corDa(selection);
  if (/\bp\s*&\s*b\b|preto e branco/.test(name) || /^\s*1\s*\/\s*[01]\b|tons de cinza/i.test(cor)) return "pb";
  return null;
}

/** Como a arte é pintada: "gray" = tons de cinza; "black" = um tom só (o que é escuro vira a gravação, o claro some). */
export function monoDo(processo: Processo | null): "gray" | "black" | null {
  if (processo === "pb") return "gray";
  if (processo === "laser" || processo === "talhamento") return "black";
  return null;
}

export const PROCESSO_INFO: Record<Processo, { titulo: string; texto: string }> = {
  pb: { titulo: "Impressão em preto e branco", texto: "Esta opção imprime em tons de cinza: a prévia e o arquivo saem sem cor." },
  laser: {
    titulo: "Gravação a laser",
    texto: "O copo é gravado a laser, não impresso: a arte sai num tom só, com o brilho do metal. Use logo ou texto em preto, sem fotos.",
  },
  talhamento: {
    titulo: "Talhamento na madeira",
    texto: "A tábua é talhada com broca, não impressa: só texto e imagem vetorial (SVG, PDF, AI, CDR ou EPS), sem fotos.",
  },
  dtf: {
    titulo: "Aplicação localizada",
    texto: "O DTF é aplicado em pontos da peça: envie imagens sem fundo (PNG transparente ou vetor). A folha não precisa ser preenchida.",
  },
};

/** Arquivos aceitos pelo processo (talhamento: só vetor). null = os de sempre. */
export function acceptDo(processo: Processo | null): string | null {
  return processo === "talhamento" ? ".svg,.pdf,.ai,.eps,.cdr,image/svg+xml,application/pdf" : null;
}

/** O arquivo serve para o processo? Talhamento: só vetor (SVG, PDF, AI, CDR, EPS). */
export function arquivoServe(processo: Processo | null, fileName: string): boolean {
  if (processo !== "talhamento") return true;
  return /\.(svg|pdf|ai|eps|cdr)$/i.test(fileName);
}

/** Cor permitida no processo: P&B só cinzas (sem saturação); laser e talhamento só o preto. */
export function corServe(processo: Processo | null, hex: string): boolean {
  if (processo !== "pb" && processo !== "laser" && processo !== "talhamento") return true;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return processo === "pb";
  const n = Number.parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  if (processo === "pb") return Math.max(r, g, b) - Math.min(r, g, b) <= 12;
  return r + g + b <= 90;
}
