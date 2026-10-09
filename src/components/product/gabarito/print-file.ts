import { loadArtFont, loadImage, paintArt, sourceOf, sourceSizeOf, type ArtRender, type ArtVariant } from "@/components/mockup/art";
import { bleedFractions, boxFromPlacement, containBox, coverBox, pixelsFor, unrotateBox, type Box, type Mm, type TemplatePage, type TemplatePanel } from "@/lib/templates";
import { canvasLimits, rasterSvg } from "@/components/mockup/image-intake";
import { renderPdfFirstPage } from "./pdf-artwork";

/*
 * Arquivo de impressão no gabarito: cada folha do gabarito vira uma página do PDF no tamanho real (mm), com
 * a arte de cada painel ocupando a caixa da sangria — exatamente onde a produção espera ("não mova o
 * gabarito de posição"). Sem linhas de corte, sangria ou segurança (a orientação da Padrão pede para tirar).
 * Folha de um painel só ganha TrimBox (corte) e BleedBox (sangria).
 *
 * Referencial da arte:
 *   - "cut": a área do editor É o corte do painel (o layout da arte está em frações do corte; a imagem pode
 *     passar até a sangria); a pintura usa a sangria em volta.
 *   - "fit": a área do editor tem outra proporção (a do mockup); a composição inteira é encaixada no
 *     painel (preencher a sangria, ou inteira na área de segurança).
 */

/** Uma peça (painel inteiro ou face de peça contínua) e a arte que vai nela. */
export type PieceJob = {
  /** Painel de pé da peça (na face: o recorte dela, em coordenadas próprias). */
  panel: TemplatePanel;
  /** Caixa da sangria da peça na folha (mm) e o giro (horário) da arte nela. */
  at: Box;
  rotate: 0 | 90 | 180 | 270;
  /** Arte da peça (frente, verso), ou null para só o fundo (laterais, fundo, alças). */
  art: ArtRender | null;
  frame: "cut" | "fit";
  /** Proporção da área do editor no modo "fit". */
  aspect?: number;
  mode?: "cover" | "contain";
};

/** Um painel da folha: o fundo e as peças dele (uma só, ou uma por face). */
export type PanelJob = {
  panel: TemplatePanel;
  /** Cor de fundo do painel (onde nenhuma arte chega). */
  fill?: string;
  pieces: PieceJob[];
};

export type SheetJob = { page: TemplatePage; panels: PanelJob[] };

/** Resolução alvo de impressão. */
export const PRINT_DPI = 300;

/** Resolução possível para uma caixa (300 dpi, ou menos quando a peça é muito grande, como lonas). */
export function printDpi(box: Mm, wanted = PRINT_DPI): number {
  const { pixels, side } = canvasLimits();
  const px = pixelsFor(box, wanted);
  const shrink = Math.min(1, Math.sqrt(pixels / (px.w * px.h)), side / Math.max(px.w, px.h));
  // O teto do canvas vale mesmo abaixo de 30 dpi (faixa de 50 m): sem canvas, não há arquivo.
  return Math.max(1, Math.min(wanted * shrink, Math.max(30, Math.floor(wanted * shrink))));
}

/** Pixels de uma caixa numa resolução, sem passar do teto do canvas. */
function cappedPixels(box: Mm, dpi: number): Mm {
  const { pixels, side } = canvasLimits();
  const px = pixelsFor(box, dpi);
  const k = Math.min(1, Math.sqrt(pixels / (px.w * px.h)), side / Math.max(px.w, px.h));
  return { w: Math.max(1, Math.floor(px.w * k)), h: Math.max(1, Math.floor(px.h * k)) };
}

/**
 * Imagem da arte na resolução do arquivo: o original (não a cópia de 2048 px do 3D), ou o PDF renderizado
 * no tamanho em que foi colocado. Se o original não puder mais ser lido (arquivo alterado no disco, seletor
 * de nuvem), usa a cópia reduzida em vez de falhar.
 */
async function sourceImage(src: string | null, px: Mm, preview: boolean): Promise<HTMLImageElement | null> {
  if (!src) return null;
  const info = preview ? null : sourceOf(src);
  try {
    if (info?.file && info.kind === "pdf") {
      const canvas = await renderPdfFirstPage(info.file, px);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      canvas.width = 0;
      canvas.height = 0;
      if (blob) return await loadBlobImage(blob);
    }
    if (info?.file && info.kind === "svg") {
      // Vetor: rasterizado já no tamanho em que vai impresso (nítido em qualquer medida).
      const doc = new DOMParser().parseFromString(await info.file.text(), "image/svg+xml");
      const svg = doc.documentElement;
      if (!svg.getAttribute("viewBox")) {
        const w = Number.parseFloat(svg.getAttribute("width") ?? "");
        const h = Number.parseFloat(svg.getAttribute("height") ?? "");
        if (w > 0 && h > 0) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      }
      svg.setAttribute("width", String(px.w));
      svg.setAttribute("height", String(px.h));
      svg.setAttribute("preserveAspectRatio", "none");
      const canvas = await rasterSvg(new XMLSerializer().serializeToString(svg), px.w, px.h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      canvas.width = 0;
      canvas.height = 0;
      if (blob) return await loadBlobImage(blob);
    }
    if (info?.file && info.kind === "image") return await loadBlobImage(info.file);
  } catch {
    // segue com a cópia reduzida
  }
  return loadImage(src);
}

/** Caixa (mm) em que a imagem da arte foi colocada na peça (para renderizar o PDF enviado nesse tamanho). */
function placedBox(art: ArtRender, panel: TemplatePanel): Mm {
  const p = art.layout?.image;
  const size = sourceSizeOf(art.src);
  if (!p || !size) return panel.bleed;
  const box = boxFromPlacement(p, panel.cut, size.w / Math.max(1, size.h));
  // Girada, a caixa sem giro é a que importa (a imagem é desenhada antes do giro).
  return { w: Math.max(box.w, 1), h: Math.max(box.h, 1) };
}

async function loadBlobImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    await image.decode?.().catch(() => undefined);
    return image;
  } finally {
    // A imagem já decodificada continua utilizável depois de liberar a URL.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/**
 * Pinta um painel: canvas do tamanho da caixa da sangria na resolução pedida, com o fundo e cada peça
 * (painel inteiro ou face) no lugar e no giro do gabarito.
 * `preview`: usa a cópia reduzida da imagem (prévia rápida da folha no passo da arte).
 */
export async function renderPanel(job: PanelJob, dpi: number, variant: ArtVariant, label: string, preview = false, cache?: Map<PieceJob, HTMLCanvasElement>): Promise<HTMLCanvasElement> {
  const { panel } = job;
  const px = pixelsFor(panel.bleed, dpi);
  const canvas = document.createElement("canvas");
  canvas.width = px.w;
  canvas.height = px.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  if (job.fill && job.fill !== "rgba(0,0,0,0)") {
    ctx.fillStyle = job.fill;
    ctx.fillRect(0, 0, px.w, px.h);
  }
  const k = px.w / panel.bleed.w;
  for (const piece of job.pieces) {
    if (!piece.art) continue;
    // Peça maior que o painel (mosaico): pintada uma vez, numa resolução que caiba, e recortada por placa.
    const shared = piece.at.w > panel.bleed.w + 0.5 || piece.at.h > panel.bleed.h + 0.5;
    let art = shared ? cache?.get(piece) : undefined;
    if (!art) {
      art = await renderPiece(piece, shared ? Math.min(dpi, printDpi(piece.at)) : dpi, variant, label, preview);
      if (shared) cache?.set(piece, art);
    }
    // Volta a peça (pintada de pé) para o giro dela no gabarito, no lugar da sangria dela no painel.
    const w = piece.at.w * k;
    const h = piece.at.h * k;
    ctx.save();
    ctx.translate((piece.at.x - panel.bleed.x) * k + w / 2, (piece.at.y - panel.bleed.y) * k + h / 2);
    ctx.rotate((piece.rotate * Math.PI) / 180);
    const turned = piece.rotate === 90 || piece.rotate === 270;
    const dw = turned ? h : w;
    const dh = turned ? w : h;
    ctx.drawImage(art, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    if (!shared) {
      art.width = 0;
      art.height = 0;
    }
  }
  return canvas;
}

/** Pinta uma peça de pé: canvas da caixa da sangria dela, com a arte no referencial do editor. */
async function renderPiece(job: PieceJob, dpi: number, variant: ArtVariant, label: string, preview: boolean): Promise<HTMLCanvasElement> {
  const { panel } = job;
  const art = job.art as ArtRender;
  const px = pixelsFor(panel.bleed, dpi);
  const canvas = document.createElement("canvas");
  canvas.width = px.w;
  canvas.height = px.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  await loadArtFont(art);
  const render: ArtRender = { ...art, sample: false, back: null };
  if (job.frame === "cut") {
    const image = await sourceImage(art.src, cappedPixels(placedBox(art, panel), dpi), preview);
    paintArt(canvas, variant, render, image, label, { bleed: bleedFractions(panel) });
    return canvas;
  }
  // "fit": pinta a área do editor na proporção dela e encaixa a composição no painel.
  const aspect = job.aspect && job.aspect > 0 ? job.aspect : panel.cut.w / panel.cut.h;
  const target: Box = job.mode === "contain" ? (panel.safe ?? panel.cut) : panel.bleed;
  const unit = { w: aspect * 1000, h: 1000 };
  const place = job.mode === "contain" ? containBox(unit, target) : coverBox(unit, target);
  const areaPx = pixelsFor(place, dpi);
  const area = document.createElement("canvas");
  area.width = areaPx.w;
  area.height = areaPx.h;
  const image = await sourceImage(art.src, cappedPixels(place, dpi), preview);
  paintArt(area, variant, render, image, label);
  // Estampa sem fundo (DTF) fica transparente em volta; as demais ganham o fundo da arte.
  if (art.background !== "rgba(0,0,0,0)") {
    ctx.fillStyle = art.background || "#ffffff";
    ctx.fillRect(0, 0, px.w, px.h);
  }
  const k = px.w / panel.bleed.w;
  ctx.drawImage(area, (place.x - panel.bleed.x) * k, (place.y - panel.bleed.y) * k, place.w * k, place.h * k);
  return canvas;
}

const mmToPt = (mm: number) => (mm / 25.4) * 72;

/** O painel tem transparência? (Amostra reduzida: um canvas de 40 MP não é varrido inteiro.) */
function hasAlpha(canvas: HTMLCanvasElement): boolean {
  const side = 256;
  const probe = document.createElement("canvas");
  probe.width = side;
  probe.height = side;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return true;
  ctx.drawImage(canvas, 0, 0, side, side);
  const data = ctx.getImageData(0, 0, side, side).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

async function canvasBytes(canvas: HTMLCanvasElement, png: boolean): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", 0.95));
  if (!blob) throw new Error("não foi possível gerar a imagem do painel");
  return new Uint8Array(await blob.arrayBuffer());
}

/** PDF de impressão: uma página por folha do gabarito, no tamanho real, com a arte de cada painel no lugar. */
export async function buildPrintPdf(sheets: SheetJob[], opts: { title: string; variant: ArtVariant; label: string; transparent?: boolean }): Promise<Blob> {
  const { PDFDocument, PDFName, PDFNumber, degrees } = await import("pdf-lib");
  const cache = new Map<PieceJob, HTMLCanvasElement>();
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title);
  doc.setCreator("Padrão Color — loja online");
  doc.setProducer("Padrão Color — encaixe no gabarito");
  for (const sheet of sheets) {
    const { page } = sheet;
    // Folha girada para a orientação da peça: o PDF volta à posição original do gabarito.
    const rotated = Boolean(page.rotated);
    const sheetMm = rotated ? { w: page.sheet.h, h: page.sheet.w } : page.sheet;
    const original = (b: Box) => (rotated ? unrotateBox(b, page.sheet) : b);
    // Página acima de 14.400 pt (~5 m, limite do PDF): escreve em escala e marca /UserUnit (faixas e lonas).
    const unit = Math.max(1, Math.ceil(Math.max(mmToPt(sheetMm.w), mmToPt(sheetMm.h)) / 14_400));
    const pt = (mm: number) => mmToPt(mm) / unit;
    const H = pt(sheetMm.h);
    const pdfPage = doc.addPage([pt(sheetMm.w), H]);
    if (unit > 1) pdfPage.node.set(PDFName.of("UserUnit"), PDFNumber.of(unit));
    const box = (b: Box) => {
      const o = original(b);
      return [pt(o.x), H - pt(o.y + o.h), pt(o.w), pt(o.h)] as const;
    };
    if (sheet.panels.length === 1) {
      pdfPage.setTrimBox(...box(sheet.panels[0].panel.cut));
      pdfPage.setBleedBox(...box(sheet.panels[0].panel.bleed));
    }
    for (const job of sheet.panels) {
      // Painel sem arte e sem fundo (estampa sem fundo): nada a imprimir nele.
      if (!job.pieces.some((p) => p.art) && (!job.fill || job.fill === "rgba(0,0,0,0)")) continue;
      const dpi = printDpi(job.panel.bleed);
      const canvas = await renderPanel(job, dpi, opts.variant, opts.label, false, cache);
      // PNG só quando o painel tem transparência de fato (estampa DTF); foto e fundo cheio vão em JPEG.
      const png = Boolean(opts.transparent) && hasAlpha(canvas);
      const bytes = await canvasBytes(canvas, png);
      const image = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const [x, y, width, height] = box(job.panel.bleed);
      if (rotated) {
        // A arte foi pintada na folha girada (sentido horário): volta 90° no anti-horário, girando no canto de baixo.
        pdfPage.drawImage(image, { x: x + width, y, width: height, height: width, rotate: degrees(90) });
      } else pdfPage.drawImage(image, { x, y, width, height });
      // Grava a imagem no documento agora e solta os buffers decodificados (o pdf-lib só faria isso no save).
      await image.embed();
      // Libera a memória do canvas grande antes do próximo painel.
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  // Sem "object streams": RIPs e fluxos PDF/X mais antigos leem melhor a estrutura clássica.
  const bytes = await doc.save({ useObjectStreams: false });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
