import { ART_STYLES, DEFAULT_ART, contrastRatio, hasArtContent, styleLabel, type ArtSettings, type ArtStyle } from "@/components/mockup/art";
import { autoFitArt, fitAreaFor } from "@/components/product/auto-fit";
import type { KitArtMode, KitDetails } from "@/lib/kit-builder";
import type { MockupSpec } from "@/lib/mockup";
import { artArea } from "@/lib/mockup-kinds";
import { getPalette } from "@/lib/party";

/*
 * Arte do kit: o cliente envia o logo e escreve o nome uma vez, e cada item recebe a arte encaixada na área de
 * impressão dele (o mesmo tratador da página de produto: logo inteiro e centralizado, foto preenchendo, sem o
 * fundo branco nas camisetas). Um item pode ganhar arte própria no editor (a mesma da página de produto) ou ficar
 * para o cliente mandar o arquivo depois do pedido.
 */

/** Como a arte do kit aparece: o estilo do nome, o nome junto do logo e o fundo atrás do logo. */
export type KitLook = { style: ArtStyle; showName: boolean; background: "branco" | "marca" };

export const DEFAULT_KIT_LOOK: KitLook = { style: "moderno", showName: false, background: "branco" };

/** Logo enviado uma vez para o kit inteiro. */
export type KitLogo = {
  name: string;
  /** O arquivo que o cliente enviou: é ele que vai para a produção (o checkout manda para o Bunny). */
  file: File;
  /** Prévia tratada (null: formato sem prévia, como AI e CDR, que vai anexado ao pedido pelo nome). */
  src: string | null;
  /** A mesma imagem sem o fundo branco ligado à borda, para as peças em que o fundo não é impresso. */
  clear: string | null;
  /** O que o tratador fez ("margens vazias cortadas…") ou por que não há prévia. */
  note: string | null;
};

/** O que o cliente fez num item: arte própria (montada no editor) e/ou arquivo mandado depois. */
export type ItemArtState = {
  own: ArtSettings | null;
  ownName: string | null;
  later: boolean;
  /** Arquivo sem prévia (AI, CDR) enviado só para o item: vai para a produção como foi enviado. */
  ownFile?: File | null;
};

/** A arte de um item pronta para a tela, o 3D e o carrinho. */
export type ItemView = {
  key: string;
  spec: MockupSpec;
  /** A arte do kit encaixada neste item. */
  shared: ArtSettings;
  /** A que vale: a própria, se houver, senão a do kit. */
  art: ArtSettings;
  mode: KitArtMode;
  ownName: string | null;
  ownFile: File | null;
  /** Muda quando a peça ou a arte mudam: a foto 3D guardada só vale com a mesma chave. */
  photoKey: string;
};

/** Foto 3D do item (miniatura do carrinho e do kit), guardada com a chave da peça e da arte. */
export type KitShot = { key: string; src: string };

const WHITE = "#ffffff";
/** Texto sobre o fundo branco quando a cor da marca não contrasta (o "Preto" da lista de cores). */
const INK = "#000000";

/** Arte comum do kit: o logo (ou o nome da marca no estilo escolhido), a frase e as cores da marca. */
export function kitBaseArt(details: KitDetails, look: KitLook, logo: KitLogo | null): ArtSettings {
  const palette = getPalette(details.palette);
  const image = logo?.src ?? null;
  const white = Boolean(image) && look.background === "branco";
  const background = white ? WHITE : palette.background;
  const textColor = white ? (contrastRatio(palette.ink, WHITE) >= 3 ? palette.ink : INK) : palette.ink;
  const showText = !image || look.showName;
  const brand = details.brand.trim();
  return {
    ...DEFAULT_ART,
    src: image,
    // Sem logo e sem nome ainda: a prévia mostra "Sua marca" (o carrinho pede a arte antes).
    text: showText ? brand || (image ? "" : "Sua marca") : "",
    subtext: showText ? details.phrase.trim() : "",
    style: look.style,
    font: ART_STYLES.find((style) => style.value === look.style)?.font ?? DEFAULT_ART.font,
    background,
    textColor,
  };
}

/**
 * A arte do kit no item: o logo entra encaixado na área de impressão da peça (sem o fundo branco nas camisetas e
 * sacolas plásticas); só com o nome, o template do estilo se ajusta sozinho à área.
 */
export function sharedItemArt(base: ArtSettings, spec: MockupSpec, logo: KitLogo | null): ArtSettings {
  if (!base.src || !logo) return base;
  const area = fitAreaFor(spec);
  const src = area.transparentBase ? (logo.clear ?? base.src) : base.src;
  return autoFitArt({ ...base, src }, area);
}

/** Chave da foto 3D: a peça e tudo o que aparece da arte. */
export function photoKey(spec: MockupSpec, art: ArtSettings): string {
  return JSON.stringify([spec, art]);
}

/** O item ainda não tem arte: nem o logo ou o nome do kit, nem arte própria, nem "enviar depois". */
export function itemMissingArt(view: Pick<ItemView, "mode" | "art" | "ownName" | "spec">, kitHasArt: boolean): boolean {
  if (view.spec.blank || view.mode === "later") return false;
  if (view.mode === "own") return !hasArtContent(view.art) && !view.ownName;
  return !kitHasArt;
}

/** Linha "Arte: …" do item no carrinho e no pedido (null = enviar depois). */
export function itemArtName(view: Pick<ItemView, "mode" | "art" | "ownName" | "spec">, logo: KitLogo | null): string | null {
  if (view.spec.blank) return "produto sem impressão";
  if (view.mode === "later") return null;
  const text = Boolean(view.art.text.trim() || (view.art.subtext ?? "").trim());
  const typed = `texto no mockup · estilo ${styleLabel(view.art.style).toLowerCase()}`;
  if (view.mode === "own") {
    // Arquivo enviado só para o item; senão o logo do kit (ajustado no item) e/ou o texto.
    const image = view.ownName ?? (view.art.src && logo ? logo.name : view.art.src ? "imagem" : null);
    if (image) return `${image}${text ? " + texto" : ""} · ajustada neste item`;
    return text ? typed : null;
  }
  if (logo) return `${logo.name} · logo do kit${view.art.src && text ? " + nome" : ""}`;
  return typed;
}

const cm = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** "20 × 8,5 cm": a área de impressão da peça. */
export function areaLabel(spec: MockupSpec): string {
  const area = artArea(spec);
  return `${cm(area.widthCm)} × ${cm(area.heightCm)} cm`;
}

export type ArtStatus = { label: string; detail: string; tone: "ok" | "own" | "later" | "missing" | "blank" };

/** Situação da arte do item (linha "Arte" do card, galeria do kit e resumo). */
export function itemArtStatus(view: ItemView, logo: KitLogo | null, kitHasArt: boolean): ArtStatus {
  if (view.spec.blank) return { label: "Vendido sem impressão", detail: "A arte aparece só na simulação.", tone: "blank" };
  if (view.mode === "later") return { label: "Arte enviada depois", detail: "A equipe pede o arquivo depois do pedido.", tone: "later" };
  if (view.mode === "own") {
    if (itemMissingArt(view, kitHasArt)) return { label: "Falta a arte deste item", detail: "Escreva um texto ou envie uma imagem no editor.", tone: "missing" };
    const what = view.ownName ?? (view.art.src ? "imagem" : `texto no estilo ${styleLabel(view.art.style).toLowerCase()}`);
    return { label: "Arte própria deste item", detail: what, tone: "own" };
  }
  if (!kitHasArt) return { label: "Falta a arte", detail: "Envie o logo ou escreva o nome da marca.", tone: "missing" };
  const area = `área de ${areaLabel(view.spec)}`;
  if (logo && !logo.src) return { label: "Logo do kit (arquivo anexado)", detail: `${logo.name} · a prévia usa o nome`, tone: "ok" };
  if (logo) {
    const fit = view.art.templateFit;
    const notes = [area];
    if (fit?.limitedByDpi) notes.push("menor para sair nítido");
    if (logo.clear !== logo.src && view.art.src === logo.clear && fitAreaFor(view.spec).transparentBase) notes.push("sem o fundo branco");
    return { label: "Logo do kit", detail: notes.join(" · "), tone: "ok" };
  }
  return { label: "Nome da marca", detail: `estilo ${styleLabel(view.art.style).toLowerCase()} · ${area}`, tone: "ok" };
}
