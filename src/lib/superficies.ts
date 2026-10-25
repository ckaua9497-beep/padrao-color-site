/*
 * Superfícies de arte de um produto: onde o cliente pode pôr uma arte própria (revisão da Padrão de 25/10/2026: cada
 * página do photobook, o miolo da agenda e do planner, o interior do porta passaporte, os lados da caixa acrílica, as
 * mangas das camisas, as 4 partes do short, o verso de todo 4/1 e 4/4…).
 *
 * - "front" é a arte principal (ArtSettings), "back" é a do verso (ArtSettings.back) e as demais ficam em
 *   ArtSettings.faces[id].
 * - As extras saem do gabarito oficial: cada peça "other" com nome (que antes só recebia a cor de fundo) vira uma
 *   superfície, menos a lombada. Peças repetidas da mesma folha (o short tem "Frente do short" no lado direito e no
 *   esquerdo) viram superfícies próprias, com o nome do painel.
 * - O verso vale nas peças de duas faces (camisa, almofada, cama pet, wind banner, estojo), quando o gabarito tem verso
 *   e a cor imprime atrás, e em todo 4/1 e 4/4 (ou quando a variação aceita "Impressão Verso"), mesmo sem gabarito.
 *
 * Puro e testado (superficies.test.ts): imports com extensão .ts, tipos com `import type`, sem JSX.
 */

import { folhaDeVerniz, piecesOf, printsBack, type Piece, type TemplatePage } from "./templates.ts";
import type { Selection } from "./pricing.ts";

export type Superficie = {
  /** "front", "back" ou o id da superfície extra (chave em ArtSettings.faces). */
  id: string;
  label: string;
  /** Página de uma sequência (photobook, calendário): o editor mostra uma tira em vez de abas. */
  pagina?: boolean;
};

/** Peças de duas faces com arte própria no verso, qualquer que seja a opção de cor. */
const SEMPRE_VERSO = new Set(["tshirt", "cushion", "petbed"]);

/** Peças "other" do gabarito que não viram superfície: a lombada sai na cor do fundo da capa. */
const SEM_ARTE = /lombada/i;

/** Id estável a partir do nome da peça ("Miolo – página ímpar" → "miolo-pagina-impar"). */
export function faceIdOf(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "face"
  );
}

/** Valor da opção de cor/impressão da seleção ("4/4 (colorido frente e verso)"), ou "". */
function corDa(selection: Selection): string {
  const entry = Object.entries(selection).find(([key]) => /^(\d+\s*-\s*)?(cor(es)?\b|impress|lados)/i.test(key));
  return entry?.[1] ?? "";
}

export type VersoInput = {
  kind: string;
  variant?: string | null;
  /** Nome do produto (sem acento, minúsculo, como o normalizeName do mockup). */
  name: string;
  selection: Selection;
  /** Tipos de anexo que a variação aceita (tipos_anexo da API). */
  anexos: readonly string[];
};

/**
 * A seleção tem verso para personalizar? Peças de duas faces sempre (camisa, almofada, cama pet, wind banner e estojo,
 * que a Padrão disse serem personalizados dos dois lados). Nas outras, a cor decide: "4/0", "só frente" = não; "4/1",
 * "4/4", "1/1", "frente e verso" = sim. Sem opção de cor, vale a variação aceitar "Impressão Verso".
 */
export function temVerso({ kind, variant, name, selection, anexos }: VersoInput): boolean {
  if (SEMPRE_VERSO.has(kind)) return true;
  if (kind === "flag" && /\bwind\b/.test(name)) return true;
  if (kind === "bag" && variant === "pencil-case") return true;
  const cor = corDa(selection);
  if (cor) {
    if (/\b\d\s*\/\s*0\b|s[oó]\s*frente/i.test(cor)) return false;
    if (/\b\d\s*\/\s*[1-4]\b|frente\s*e\s*verso/i.test(cor)) return true;
  }
  return anexos.includes("Impressão Verso") && printsBack(selection);
}

/** Nome da peça para a superfície: o da face, com o do painel quando a mesma face se repete na folha (short). */
function pieceLabel(page: TemplatePage, piece: Piece, repeated: boolean): string {
  const name = piece.name?.trim() || page.part || page.label;
  const panel = page.panels[piece.panelIndex]?.name?.trim();
  return repeated && panel && panel !== name ? `${name} (${panel.charAt(0).toLowerCase()}${panel.slice(1)})` : name;
}

/**
 * Superfície que recebe a arte de uma peça do gabarito: "front"/"back" (a primeira peça de cada lado na folha) ou o id
 * da extra. null = a peça fica na cor do fundo (lombada).
 */
export function superficieDaPeca(page: TemplatePage, piece: Piece): string | null {
  const same = piecesOf(page).filter((p) => p.side === piece.side && (p.name ?? "") === (piece.name ?? ""));
  const repeated = same.length > 1;
  const first = same[0]?.panelIndex === piece.panelIndex && same[0]?.faceIndex === piece.faceIndex;
  if (piece.side === "front" || piece.side === "back") {
    // Repetida na mesma folha (short): a primeira é a frente/o verso; as outras são superfícies próprias.
    if (!repeated || first) return piece.side;
    return faceIdOf(pieceLabel(page, piece, true));
  }
  const name = pieceLabel(page, piece, repeated);
  if (SEM_ARTE.test(name)) return null;
  return faceIdOf(name);
}

export type SuperficiesInput = {
  /** Folhas do gabarito na seleção (vazio sem gabarito). */
  pages: readonly TemplatePage[];
  /** Resultado de temVerso (ou a regra do gabarito). */
  verso: boolean;
  /** Rótulos da frente e do verso ("Capa"/"Contracapa" nos livros; "Frente"/"Costas" na camisa). */
  frontLabel?: string;
  backLabel?: string;
};

/**
 * Superfícies do produto na seleção: a frente, o verso (quando há) e as extras do gabarito, na ordem das folhas. Peças
 * "other" de folhas de miolo (photobook, calendário) viram páginas de uma tira.
 */
export function superficiesDe({ pages, verso, frontLabel = "Frente", backLabel = "Verso" }: SuperficiesInput): Superficie[] {
  const list: Superficie[] = [{ id: "front", label: frontLabel }];
  if (verso) list.push({ id: "back", label: backLabel });
  const seen = new Set(list.map((s) => s.id));
  for (const page of pages) {
    // A máscara de verniz não é superfície de arte (sai da arte da frente e do verso).
    if (folhaDeVerniz(page)) continue;
    const pieces = piecesOf(page);
    for (const piece of pieces) {
      const id = superficieDaPeca(page, piece);
      // A frente e o verso já estão (ou não, conforme `verso`): a peça do verso sem verso na cor não vira extra.
      if (!id || id === "front" || id === "back" || seen.has(id)) continue;
      seen.add(id);
      const repeated = pieces.filter((p) => p.side === piece.side && (p.name ?? "") === (piece.name ?? "")).length > 1;
      list.push({ id, label: pieceLabel(page, piece, repeated), ...(/miolo/i.test(page.part ?? "") ? { pagina: true } : {}) });
    }
  }
  // Muitas páginas (photobook, calendário): todas viram tira, inclusive a capa e a contracapa.
  return list;
}

/** Rótulos da frente e do verso pelo tipo de peça. */
export function rotulosDosLados(kind: string, variant?: string | null): { frontLabel: string; backLabel: string } {
  if (kind === "book") return { frontLabel: "Capa", backLabel: "Contracapa" };
  if (kind === "tshirt") return { frontLabel: "Frente", backLabel: "Costas" };
  if (kind === "passport") return { frontLabel: "Frente", backLabel: "Verso" };
  // Short: as peças do lado esquerdo viram superfícies próprias com o nome do painel; a frente e o verso são as do direito.
  if (kind === "shorts") return { frontLabel: "Frente do short (lado direito)", backLabel: "Verso do short (lado direito)" };
  if (kind === "box" && variant === "acrylic") return { frontLabel: "Lateral frontal", backLabel: "Lateral traseira" };
  return { frontLabel: "Frente", backLabel: "Verso" };
}
