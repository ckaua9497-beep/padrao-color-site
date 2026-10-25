import { hasArtContent, sourceOf, sourceSizeOf, withPlacement, type ArtRender, type ArtSettings } from "@/components/mockup/art";
import type { MockupKind } from "@/lib/mockup-kinds";
import { DPI_MARGIN, coverLoss, dpiTargets, hexOf, type FitMode } from "@/lib/image-prep";
import { autoPlacementFor, containBox, coverBox, pieceFrame, pieceKey, piecesOf, placementFromBox, placementFromVisual, safeBoxOf, type Box, type PanelRef, type Piece, type TemplatePage } from "@/lib/templates";
import { superficieDaPeca } from "@/lib/superficies";
import { backgroundTouched, restoreBackground } from "../auto-fit";
import type { PanelJob, PieceJob, SheetJob } from "./print-file";

/*
 * O gabarito na página do produto: as folhas da seleção, a peça de cada lado (painel inteiro, face de peça
 * contínua ou mosaico) e se o editor trabalha no corte da peça ("frame") ou na área do mockup ("fit", só por
 * curadoria).
 */

export type GabaritoSide = { ref: PanelRef; frame: boolean };

export type Gabarito = {
  /** Folhas da seleção atual (no tamanho de referência, nas camisas). */
  pages: TemplatePage[];
  /** Folhas que entram no arquivo de impressão (camisas: um tamanho por folha, os que têm peças). */
  printPages: TemplatePage[];
  front: GabaritoSide | null;
  back: GabaritoSide | null;
  /** Peça de cada superfície extra (ids de src/lib/superficies.ts: miolo, lâminas, abas, lados…). */
  faces?: Record<string, GabaritoSide>;
  /** Proporção da área do mockup (modo "fit"). */
  aspect: number;
  kind: MockupKind;
  /** Estampa sem fundo (vestuário): o PDF leva transparência. */
  transparent: boolean;
  /** Janela do texto automático (1 = a peça toda) quando o gabarito é só uma área da peça (adesivo de garrafa). */
  frontWindow?: number;
  /** Gabarito da volta inteira (caneca, copo, garrafa): fração da largura que fica de frente, onde o logo entra. */
  fitWindow?: number;
};

export type TemplateFitOptions = {
  /** Peça cujo fundo não é impresso (estampa de tecido): sem fundo de cor. */
  transparentBase?: boolean;
  /** Gabarito da volta inteira: o logo inteiro fica na parte que aparece de frente. */
  frontWindow?: number;
};

/** Corte máximo ao preencher a peça com uma foto; acima disso ela entra inteira (o resto fica no fundo da borda). */
const MAX_FILL_LOSS = 0.45;

/** O arquivo (pixels do original) já foi feito no gabarito dessa peça: folha inteira, com sangria ou no tamanho final. */
export function madeForTemplate(side: GabaritoSide | null, px: { w: number; h: number }, vector = false): boolean {
  if (!side?.frame) return false;
  return autoPlacementFor(side.ref.piece, px, null, "auto", vector).match !== "other";
}

/**
 * Aplica o encaixe automático à arte cuja imagem acabou de ser trocada (só no modo "corte").
 * Arquivo feito no gabarito (folha, sangria, tamanho final): entra 1:1. Outro arquivo, pelo tratador automático
 * (src/lib/image-prep.ts): foto cobre a sangria centrada no assunto, se o corte for aceitável; logo/arte fica
 * inteiro na área de segurança (na caneca, na parte da frente) sem passar da resolução mínima, com o fundo da
 * cor da borda dele quando a imagem é opaca.
 */
export function fitToTemplate(art: ArtSettings, side: GabaritoSide | null, { transparentBase = false, frontWindow }: TemplateFitOptions = {}): ArtSettings {
  if (!side?.frame || !art.src) return art;
  const source = sourceOf(art.src);
  const px = sourceSizeOf(art.src);
  if (!px) return art;
  const touched = backgroundTouched(art);
  const start = touched ? art : restoreBackground(art);
  const piece = side.ref.piece;
  let fit = autoPlacementFor(piece, px, source?.mm ?? null, "auto", Boolean(source?.vector));
  let background: string | null = null;
  let mode: FitMode = "fill";
  let cropLoss = 0;
  let limitedByDpi = false;
  if (fit.match === "other") {
    const analysis = source?.analysis;
    const { panel } = piece;
    const aspect = px.w / Math.max(1, px.h);
    const loss = coverLoss(aspect, panel.bleed.w / panel.bleed.h);
    const photo = analysis ? analysis.kind === "photo" : !source?.alpha;
    let rect: Box;
    if (photo && loss <= MAX_FILL_LOSS) {
      // Cobre a sangria; o assunto (centro de interesse) fica o mais perto possível do centro da peça.
      const box = coverBox(px, panel.bleed);
      const focus = analysis?.focus ?? { x: 0.5, y: 0.5 };
      const place = (start: number, size: number, area: number, f: number) => Math.min(start, Math.max(start + area - size, start + area / 2 - f * size));
      rect = { ...box, x: place(panel.bleed.x, box.w, panel.bleed.w, focus.x), y: place(panel.bleed.y, box.h, panel.bleed.h, focus.y) };
      cropLoss = loss;
    } else {
      // Inteira na área de segurança, sem ampliar além da resolução mínima da peça (vetor não tem limite).
      mode = "whole";
      const safe = safeBoxOf(panel);
      const box = containBox(px, safe);
      let k = photo ? 1 : 0.92;
      // Gabarito da volta inteira (caneca, copo, garrafa): o logo fica na parte que aparece de frente.
      if (!photo && frontWindow && frontWindow < 1) k = Math.min(k, (frontWindow * 0.9 * panel.cut.w) / Math.max(1e-6, box.w));
      if (!source?.vector) {
        // 2% acima do mínimo: no limite exato, o arredondamento do editor mostraria "baixa".
        const target = dpiTargets(Math.max(panel.cut.w, panel.cut.h) / 10).min * DPI_MARGIN;
        const dpi = px.w / ((box.w * k) / 25.4);
        if (dpi < target) {
          k = Math.max(k * (dpi / target), Math.min(k, 0.3));
          limitedByDpi = true;
        }
      }
      rect = { x: box.x + (box.w * (1 - k)) / 2, y: box.y + (box.h * (1 - k)) / 2, w: box.w * k, h: box.h * k };
      // Fundo da cor da borda só em imagem opaca (com transparência, pintaria os vazados do logo).
      if (!transparentBase && analysis && analysis.transparent < 0.02) {
        if (analysis.border.uniform && !analysis.border.transparent) background = hexOf(analysis.border.rgb);
        else if (photo) background = hexOf(analysis.border.rgb);
      }
    }
    fit = { match: "other", rect, placement: placementFromBox(rect, panel.cut, aspect) };
  }
  const applied = background && !touched ? background : null;
  return {
    ...withPlacement(start, "image", fit.placement, true),
    ...(applied ? { background: applied } : {}),
    fit: "contain",
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    templateFit: { match: fit.match, src: art.src, placement: fit.placement, piece: pieceKey(piece), mode, cropLoss, limitedByDpi, background: applied, userBackground: start.background },
  };
}

/**
 * A posição atual da imagem ainda é a do encaixe automático (e na mesma peça)? Os avisos de encaixe só valem
 * assim; `side` = a peça de agora (a troca de medida muda a peça).
 */
export function isAutoFit(art: ArtSettings | null | undefined, side?: GabaritoSide | null): boolean {
  const fit = art?.templateFit;
  const p = art?.layout?.image;
  if (!fit || !p || !art?.src || fit.src !== art.src || !fit.placement) return false;
  if (side && fit.piece && fit.piece !== pieceKey(side.ref.piece)) return false;
  const q = fit.placement;
  return Math.abs(p.x - q.x) < 1e-3 && Math.abs(p.y - q.y) < 1e-3 && Math.abs(p.scale - q.scale) / Math.max(1e-6, q.scale) < 1e-3 && Math.abs(p.rotation - q.rotation) < 0.5;
}

/**
 * Precisa refazer o encaixe? A imagem entrou pelo encaixe automático, o cliente não mexeu nela e a seleção
 * passou para outra peça (outra medida, outro tamanho).
 */
export function needsRefit(art: ArtSettings | null | undefined, side: GabaritoSide | null): boolean {
  const fit = art?.templateFit;
  if (!side?.frame || !fit?.piece || !art?.src || fit.src !== art.src) return false;
  return fit.piece !== pieceKey(side.ref.piece) && isAutoFit(art);
}

/** A folha inteira do gabarito enviada pelo cliente, levada para outra peça (cada peça recebe o seu pedaço). */
function sheetArtFor(piece: Piece, art: ArtRender): ArtRender | null {
  const size = sourceSizeOf(art.src);
  if (!art.src || !size) return null;
  const { turns, original, toView } = pieceFrame(piece);
  const placement = placementFromVisual(toView({ x: 0, y: 0, w: original.w, h: original.h }), piece.panel.cut, size.w / Math.max(1, size.h), turns * 90, true);
  // Só a imagem: o texto digitado pertence à peça da frente.
  return { ...art, text: "", subtext: "", layout: { image: placement, overflow: true } };
}

const samePiece = (a: Piece, b: Piece) => a.page.id === b.page.id && a.panelIndex === b.panelIndex && a.faceIndex === b.faceIndex;

/** Folhas do arquivo de impressão: a arte da frente nas peças da frente, a do verso nas do verso, fundo no resto. */
export function printSheets(g: Gabarito, art: ArtSettings, pages: TemplatePage[] = g.printPages): SheetJob[] {
  // Estampa de tecido sem fundo (DTF): a imagem vai sem o retângulo de fundo, como no 3D e no editor.
  const clear = (a: ArtSettings): ArtSettings => (g.transparent && a.src ? { ...a, background: "rgba(0,0,0,0)" } : a);
  const front: ArtRender = { ...clear(art), back: null, kind: g.kind, sample: false, ledColors: art.ledColors ?? undefined, frontWindow: g.frontWindow };
  // Verso só quando a seleção imprime o verso (cartão 4/0 não leva o verso antigo).
  const back: ArtRender | null = g.back && art.back && hasArtContent(art.back) ? { ...clear(art.back), back: null, kind: g.kind, sample: false, ledColors: art.back.ledColors ?? undefined, frontWindow: g.frontWindow } : null;
  // Superfícies extras (miolo, lâminas, abas, lados): a arte do cliente nela; sem arte, a peça fica na cor do fundo.
  const faceArt = (id: string): ArtRender | null => {
    const face = art.faces?.[id];
    return face && hasArtContent(face) ? { ...clear(face), back: null, faces: null, kind: g.kind, sample: false, ledColors: face.ledColors ?? undefined, frontWindow: g.frontWindow } : null;
  };
  const fill = g.transparent ? "rgba(0,0,0,0)" : art.background || "#ffffff";
  // Folha inteira do gabarito na frente: todas as peças recebem o pedaço delas (menos o verso com arte própria).
  const wholeSheet = art.templateFit?.match === "sheet" && art.src === art.templateFit.src;
  const mainPiece = g.front?.ref.piece ?? null;
  const sheets: SheetJob[] = [];
  for (const page of pages) {
    // Máscara de verniz localizado: o cliente manda à parte; não entra a arte principal.
    if (/m[aá]scara/i.test(`${page.part ?? ""} ${page.label}`)) continue;
    const pieces = piecesOf(page);
    // Verso sem arte (cartão só frente): a folha do verso fica fora do arquivo.
    if (pieces.length && pieces.every((p) => p.side === "back") && !back && !wholeSheet) continue;
    // Um job por peça (o mosaico tem uma peça para todas as placas: é pintada uma vez e recortada por placa).
    const jobs = pieces.map((piece) => {
      const surface = superficieDaPeca(page, piece);
      const extra = surface !== null && surface !== "front" && surface !== "back";
      const frame = surface === "back" ? (g.back?.frame ?? g.front?.frame) : extra ? (g.faces?.[surface]?.frame ?? g.front?.frame) : g.front?.frame;
      // Peça repetida da frente/do verso (o lado esquerdo do short) sem arte própria: repete a da frente/do verso.
      const sideArt = piece.side === "front" ? front : piece.side === "back" ? back : null;
      let pieceArt: ArtRender | null = surface === "front" ? front : surface === "back" ? back : extra ? (faceArt(surface) ?? sideArt) : null;
      if (wholeSheet && !(piece.side === "back" && back) && !(mainPiece && samePiece(piece, mainPiece))) pieceArt = sheetArtFor(piece, front);
      const job: PieceJob = { panel: piece.panel, at: piece.at, rotate: piece.rotate, art: pieceArt, frame: frame ? "cut" : "fit", aspect: g.aspect, mode: "cover" };
      return { piece, job };
    });
    const panels: PanelJob[] = page.panels.map((panel, i) => ({
      panel,
      fill,
      pieces: jobs.filter(({ piece }) => piece.panelIndex === i || piece.panelIndex === -1).map(({ job }) => job),
    }));
    sheets.push({ page, panels });
  }
  // Gabarito de folha única "frente e verso" (cartaz, cartão de PVC): sem peça de verso, o verso do cliente sai numa
  // cópia da folha da frente.
  const backSheet = back && !pages.some((page) => piecesOf(page).some((piece) => piece.side === "back")) ? sheets.find((sheet) => sheet.panels.some((panel) => panel.pieces.length)) : null;
  if (backSheet && back) {
    sheets.push({
      page: { ...backSheet.page, id: `${backSheet.page.id}#verso`, label: `${backSheet.page.label} · verso` },
      panels: backSheet.panels.map((panel) => ({ ...panel, pieces: panel.pieces.map((job) => ({ ...job, art: job.art ? back : null })) })),
    });
  }
  return sheets;
}

/** Nome do arquivo de impressão: arte-no-gabarito-<produto>.pdf */
export function printFileName(slug: string): string {
  const clean = slug.replace(/^\d+-/, "").replace(/-{2,}/g, "-").slice(0, 60) || "arte";
  return `arte-no-gabarito-${clean}.pdf`;
}
