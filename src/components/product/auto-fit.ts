import { THERMAL_WINDOW, artFamily, sourceOf, sourceSizeOf, withPlacement, type ArtSettings, type LayerPlacement } from "@/components/mockup/art";
import { autoFit, describeFit, type AutoFit, type FitMode } from "@/lib/image-prep";
import { artArea, artAspect, type ArtAreaSpec, type MockupKind } from "@/lib/mockup-kinds";

/*
 * Encaixe automático da imagem enviada nos produtos SEM gabarito (no gabarito, gabarito/jobs.ts fitToTemplate):
 * a mesma decisão do tratador (src/lib/image-prep.ts autoFit) aplicada na área de arte do mockup.
 * O resultado fica em `templateFit` (match "other", peça = "area:<proporção>"), para refazer o encaixe quando a
 * área muda (outro formato) enquanto o cliente não mexeu na imagem.
 */

export type FitArea = {
  aspect: number;
  cm: { w: number; h: number } | null;
  /** Peça de volta: fração da largura que fica de frente (o logo vai nela). */
  frontWindow?: number;
  /** Fundo da arte não é impresso (estampa de tecido, sacola plástica, saco kraft): sem fundo de cor, sem fundo branco. */
  transparentBase: boolean;
};

const WRAP_WINDOW: Partial<Record<MockupKind, number>> = { mug: 0.38, tumbler: 0.38, bottle: 0.38 };

export function fitAreaFor(spec: ArtAreaSpec & { kind: MockupKind }): FitArea {
  const area = artArea(spec);
  const transparentBase = artFamily(spec.kind) === "apparel" || (spec.kind === "bag" && (spec.variant === "plastic" || spec.variant === "kraft-sack"));
  return {
    aspect: artAspect(spec),
    cm: area.widthCm > 0 && area.heightCm > 0 ? { w: area.widthCm, h: area.heightCm } : null,
    frontWindow: spec.thermal ? THERMAL_WINDOW : WRAP_WINDOW[spec.kind],
    transparentBase,
  };
}

export const areaKey = (area: FitArea) => `area:${area.aspect.toFixed(4)}`;

/** Mesma posição (centro, tamanho e giro): a imagem continua onde o encaixe automático a pôs. */
export function samePlacement(p: LayerPlacement, q: LayerPlacement): boolean {
  return Math.abs(p.x - q.x) < 1e-3 && Math.abs(p.y - q.y) < 1e-3 && Math.abs(p.scale - q.scale) / Math.max(1e-6, q.scale) < 1e-3 && Math.abs(p.rotation - q.rotation) < 0.5;
}

/**
 * O fundo que o tratador pôs (cor da borda da arte) volta a ser o do cliente: chamado antes de outra imagem
 * entrar ou de outro encaixe. Se o cliente trocou o fundo depois do tratador, o dele fica.
 */
export function restoreBackground(art: ArtSettings): ArtSettings {
  const fit = art.templateFit;
  return fit?.background && fit.userBackground && art.background === fit.background ? { ...art, background: fit.userBackground } : art;
}

/** O cliente trocou o fundo depois que o tratador pôs a cor da borda: o encaixe novo não mexe mais nele. */
export function backgroundTouched(art: ArtSettings): boolean {
  const fit = art.templateFit;
  return Boolean(fit?.background) && art.background !== fit?.background;
}

/** A decisão do tratador para a imagem atual nessa área (null sem imagem tratada). */
export function decideFor(art: ArtSettings, area: FitArea, mode?: FitMode): AutoFit | null {
  const info = sourceOf(art.src);
  const px = sourceSizeOf(art.src);
  if (!info?.analysis || !px) return null;
  return autoFit(info.analysis, { areaAspect: area.aspect, areaCm: area.cm, px, frontWindow: area.frontWindow, transparentBase: area.transparentBase, vector: info.vector }, mode);
}

/** Aplica o encaixe automático (ou o modo pedido: "Preencher a área" / "Imagem inteira"). */
export function autoFitArt(art: ArtSettings, area: FitArea, mode?: FitMode): ArtSettings {
  if (!art.src) return art;
  const touched = backgroundTouched(art);
  const base = touched ? art : restoreBackground(art);
  const fit = decideFor(base, area, mode);
  if (!fit) return art;
  const placed = withPlacement({ ...base, fit: "contain", zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 }, "image", fit.placement, fit.overflow);
  // Sem preencher, a imagem não pode passar da área: tira o "overflow" que um encaixe anterior deixou.
  const layout = placed.layout ? { ...placed.layout, overflow: fit.overflow || undefined } : null;
  const background = fit.background && !touched ? fit.background : null;
  return {
    ...placed,
    layout,
    ...(background ? { background } : {}),
    templateFit: {
      match: "other",
      src: art.src,
      placement: fit.placement,
      piece: areaKey(area),
      mode: fit.mode,
      cropLoss: fit.cropLoss,
      limitedByDpi: fit.limitedByDpi,
      chosen: mode,
      background,
      userBackground: base.background,
    },
  };
}

/**
 * A imagem está no encaixe automático (o cliente não mexeu) e foi encaixada noutra peça (outro formato, ou um
 * gabarito que a seleção não tem mais): refazer na área atual.
 */
export function needsAreaRefit(art: ArtSettings, area: FitArea): boolean {
  const fit = art.templateFit;
  const p = art.layout?.image;
  if (!art.src || !fit || fit.src !== art.src || !fit.piece || fit.piece === areaKey(area) || !p || !fit.placement) return false;
  return samePlacement(p, fit.placement);
}

/** Modo atual da imagem: preenchendo a área ou inteira. */
export function fitModeOf(art: ArtSettings): FitMode {
  return art.layout?.overflow ? "fill" : "whole";
}

/** Frase do que o tratador fez (abaixo do nome do arquivo); null quando não há imagem tratada. */
export function fitReport(art: ArtSettings, area: FitArea | null): string | null {
  const info = sourceOf(art.src);
  if (!art.src || !info?.analysis) return null;
  const fit = art.templateFit;
  const p = art.layout?.image;
  if (!fit || fit.src !== art.src || !fit.placement || !p || !samePlacement(p, fit.placement)) return "Posição ajustada por você no editor.";
  if (fit.match === "sheet") return "Folha inteira do gabarito: cada peça recebe o seu pedaço.";
  if (fit.match === "bleed") return "Arquivo com sangria: entrou 1:1 no gabarito.";
  if (fit.match === "trim") return "Arquivo no tamanho final: entrou 1:1 e as bordas foram estendidas para a sangria.";
  const extras = { trimmed: info.treatment?.trimmed, vector: info.vector, backgroundRemoved: info.treatment?.backgroundRemoved };
  const mode = fit.mode ?? fitModeOf(art);
  const decided = area && fit.piece === areaKey(area) ? decideFor(art, area, mode) : null;
  const stored: AutoFit = { mode, cropLoss: fit.cropLoss ?? 0, limitedByDpi: fit.limitedByDpi ?? false, placement: fit.placement, overflow: mode === "fill", background: null, dpi: null };
  return describeFit(decided ?? stored, extras);
}
