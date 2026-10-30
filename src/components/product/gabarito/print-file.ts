import { loadArtFont, loadImage, paintArt, sourceOf, sourceSizeOf, type ArtRender, type ArtVariant, type CamadaPreto } from "@/components/mockup/art";
import { bleedFractions, boxFromPlacement, containBox, coverBox, pixelsFor, unrotateBox, type Box, type Mm, type TemplatePage, type TemplatePanel } from "@/lib/templates";
import { canvasLimits, rasterSvg } from "@/components/mockup/image-intake";
import { renderPdfFirstPage } from "./pdf-artwork";

/*
 * Arquivo de impressão no gabarito: cada folha do gabarito vira uma página do PDF no tamanho real (mm), com
 * a arte de cada painel ocupando a caixa da sangria — exatamente onde a produção espera ("não mova o
 * gabarito de posição"). Sem linhas de corte, sangria ou segurança (a orientação da Padrão pede para tirar).
 * Folha de um painel só ganha TrimBox (corte) e BleedBox (sangria).
 *
 * Preto do texto em K100 (revisão da Padrão de 29/10/2026, src/lib/preto-k100.ts): o texto preto não vai na imagem RGB do
 * painel; vai por cima, numa imagem de 1 pixel em CMYK 0/0/0/100 esticada no painel, com a máscara suave do texto
 * (SMask, PDF 1.4). Assim a letra sai só no preto, com a borda suavizada sobre o fundo de verdade.
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
export async function renderPanel(job: PanelJob, dpi: number, variant: ArtVariant, label: string, preview = false, cache?: Map<PieceJob, PieceCanvas>): Promise<HTMLCanvasElement> {
  return (await composePanel(job, dpi, variant, label, preview, false, cache)).canvas;
}

/** Peça pintada: a imagem e, com o preto em K100, a máscara do texto preto (null quando não há texto preto). */
type PieceCanvas = { art: HTMLCanvasElement; preto: HTMLCanvasElement | null };

function panelCanvas(px: Mm): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = px.w;
  canvas.height = px.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  return { canvas, ctx };
}

/** Painel inteiro; `preto`: separa o texto preto numa máscara do tamanho do painel (camada K100 do PDF). */
async function composePanel(job: PanelJob, dpi: number, variant: ArtVariant, label: string, preview: boolean, preto: boolean, cache?: Map<PieceJob, PieceCanvas>): Promise<{ canvas: HTMLCanvasElement; preto: HTMLCanvasElement | null }> {
  const { panel } = job;
  const px = pixelsFor(panel.bleed, dpi);
  const { canvas, ctx } = panelCanvas(px);
  if (job.fill && job.fill !== "rgba(0,0,0,0)") {
    ctx.fillStyle = job.fill;
    ctx.fillRect(0, 0, px.w, px.h);
  }
  let mask: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  const k = px.w / panel.bleed.w;
  for (const piece of job.pieces) {
    if (!piece.art) continue;
    // Peça maior que o painel (mosaico): pintada uma vez, numa resolução que caiba, e recortada por placa.
    const shared = piece.at.w > panel.bleed.w + 0.5 || piece.at.h > panel.bleed.h + 0.5;
    let painted = shared ? cache?.get(piece) : undefined;
    if (!painted) {
      painted = await renderPiece(piece, shared ? Math.min(dpi, printDpi(piece.at)) : dpi, variant, label, preview, preto);
      if (shared) cache?.set(piece, painted);
    }
    // Volta a peça (pintada de pé) para o giro dela no gabarito, no lugar da sangria dela no painel.
    const w = piece.at.w * k;
    const h = piece.at.h * k;
    const turned = piece.rotate === 90 || piece.rotate === 270;
    const dw = turned ? h : w;
    const dh = turned ? w : h;
    const place = (target: CanvasRenderingContext2D, source: HTMLCanvasElement) => {
      target.save();
      target.translate((piece.at.x - panel.bleed.x) * k + w / 2, (piece.at.y - panel.bleed.y) * k + h / 2);
      target.rotate((piece.rotate * Math.PI) / 180);
      target.drawImage(source, -dw / 2, -dh / 2, dw, dh);
      target.restore();
    };
    place(ctx, painted.art);
    if (painted.preto) {
      mask ??= panelCanvas(px);
      place(mask.ctx, painted.preto);
    }
    if (!shared) releaseCanvases(painted);
  }
  return { canvas, preto: mask?.canvas ?? null };
}

function releaseCanvases(piece: PieceCanvas) {
  for (const c of [piece.art, piece.preto]) {
    if (!c) continue;
    c.width = 0;
    c.height = 0;
  }
}

/** Pinta uma peça de pé: canvas da caixa da sangria dela, com a arte no referencial do editor. */
async function renderPiece(job: PieceJob, dpi: number, variant: ArtVariant, label: string, preview: boolean, preto: boolean): Promise<PieceCanvas> {
  const { panel } = job;
  const art = job.art as ArtRender;
  const px = pixelsFor(panel.bleed, dpi);
  const { canvas, ctx } = panelCanvas(px);
  await loadArtFont(art);
  const render: ArtRender = { ...art, sample: false, back: null };
  // Processo de um tom só (laser, talhamento, P&B) não leva a camada K: a peça inteira já é aquele tom.
  const sem: CamadaPreto | undefined = preto && !art.mono ? { camada: "sem" } : undefined;
  const so: CamadaPreto = { camada: "so" };
  if (job.frame === "cut") {
    const image = await sourceImage(art.src, cappedPixels(placedBox(art, panel), dpi), preview);
    const pintura: ArtRender = { ...render, aspect: panel.cut.w / panel.cut.h };
    paintArt(canvas, variant, pintura, image, label, { bleed: bleedFractions(panel), preto: sem });
    if (!sem?.desenhou) return { art: canvas, preto: null };
    const mask = panelCanvas(px).canvas;
    paintArt(mask, variant, pintura, image, label, { bleed: bleedFractions(panel), extend: false, preto: so });
    return { art: canvas, preto: mask };
  }
  // "fit": pinta a área do editor na proporção dela e encaixa a composição no painel.
  const aspect = job.aspect && job.aspect > 0 ? job.aspect : panel.cut.w / panel.cut.h;
  const target: Box = job.mode === "contain" ? (panel.safe ?? panel.cut) : panel.bleed;
  const unit = { w: aspect * 1000, h: 1000 };
  const place = job.mode === "contain" ? containBox(unit, target) : coverBox(unit, target);
  const areaPx = pixelsFor(place, dpi);
  const area = panelCanvas(areaPx).canvas;
  const image = await sourceImage(art.src, cappedPixels(place, dpi), preview);
  paintArt(area, variant, { ...render, aspect }, image, label, { preto: sem });
  // Estampa sem fundo (DTF) fica transparente em volta; as demais ganham o fundo da arte.
  if (art.background !== "rgba(0,0,0,0)") {
    ctx.fillStyle = art.background || "#ffffff";
    ctx.fillRect(0, 0, px.w, px.h);
  }
  const k = px.w / panel.bleed.w;
  const at = [(place.x - panel.bleed.x) * k, (place.y - panel.bleed.y) * k, place.w * k, place.h * k] as const;
  ctx.drawImage(area, ...at);
  area.width = 0;
  area.height = 0;
  if (!sem?.desenhou) return { art: canvas, preto: null };
  const areaMask = panelCanvas(areaPx).canvas;
  paintArt(areaMask, variant, { ...render, aspect }, image, label, { preto: so });
  const mask = panelCanvas(px);
  mask.ctx.drawImage(areaMask, ...at);
  areaMask.width = 0;
  areaMask.height = 0;
  return { art: canvas, preto: mask.canvas };
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

/** Canal alfa do canvas (a máscara do texto preto), lido em faixas para não alocar o RGBA inteiro de um painel grande. */
function alphaOf(canvas: HTMLCanvasElement): Uint8Array {
  const { width: w, height: h } = canvas;
  const out = new Uint8Array(w * h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;
  const band = Math.max(1, Math.floor(4_000_000 / Math.max(1, w)));
  for (let top = 0; top < h; top += band) {
    const rows = Math.min(band, h - top);
    const data = ctx.getImageData(0, top, w, rows).data;
    for (let i = 0, o = top * w; i < data.length; i += 4, o += 1) out[o] = data[i + 3];
  }
  return out;
}

async function canvasBytes(canvas: HTMLCanvasElement, png: boolean): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", 0.95));
  if (!blob) throw new Error("não foi possível gerar a imagem do painel");
  return new Uint8Array(await blob.arrayBuffer());
}

/** PDF de impressão: uma página por folha do gabarito, no tamanho real, com a arte de cada painel no lugar. */
export async function buildPrintPdf(sheets: SheetJob[], opts: { title: string; variant: ArtVariant; label: string; transparent?: boolean }): Promise<Blob> {
  const { PDFDocument, PDFName, PDFNumber, degrees, drawImage } = await import("pdf-lib");
  const cache = new Map<PieceJob, PieceCanvas>();
  // Preto do texto em K100: não na estampa sem fundo (DTF, PNG com transparência), nem no neon e na peça lisa.
  const comPreto = !opts.transparent && opts.variant !== "neon" && opts.variant !== "blank";
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
      const { canvas, preto } = await composePanel(job, dpi, opts.variant, opts.label, false, comPreto, cache);
      // PNG só quando o painel tem transparência de fato (estampa DTF); foto e fundo cheio vão em JPEG.
      const png = Boolean(opts.transparent) && hasAlpha(canvas);
      const bytes = await canvasBytes(canvas, png);
      const image = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const [x, y, width, height] = box(job.panel.bleed);
      // A arte foi pintada na folha girada (sentido horário): volta 90° no anti-horário, girando no canto de baixo.
      const lugar = rotated ? { x: x + width, y, width: height, height: width, rotate: degrees(90) } : { x, y, width, height, rotate: degrees(0) };
      pdfPage.drawImage(image, lugar);
      // Grava a imagem no documento agora e solta os buffers decodificados (o pdf-lib só faria isso no save).
      await image.embed();
      if (preto) {
        // Camada K100: 1 pixel CMYK 0/0/0/100 com a máscara suave do texto preto (SMask do tamanho do painel).
        const smask = doc.context.register(
          doc.context.flateStream(alphaOf(preto), { Type: "XObject", Subtype: "Image", Width: preto.width, Height: preto.height, ColorSpace: "DeviceGray", BitsPerComponent: 8 }),
        );
        const k100 = doc.context.register(
          doc.context.stream(new Uint8Array([0, 0, 0, 255]), { Type: "XObject", Subtype: "Image", Width: 1, Height: 1, ColorSpace: "DeviceCMYK", BitsPerComponent: 8, SMask: smask }),
        );
        pdfPage.pushOperators(...drawImage(pdfPage.node.newXObject("Image", k100), { ...lugar, xSkew: degrees(0), ySkew: degrees(0) }));
        preto.width = 0;
        preto.height = 0;
      }
      // Libera a memória do canvas grande antes do próximo painel.
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  // Sem "object streams": RIPs e fluxos PDF/X mais antigos leem melhor a estrutura clássica.
  const bytes = await doc.save({ useObjectStreams: false });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/**
 * Imagem da arte no gabarito para as "Artes enviadas" de Meus pedidos (src/lib/artes-enviadas): as folhas, uma embaixo da
 * outra e de pé como no editor, com a arte de cada painel e por cima a sangria (azul tracejado), o corte (linha cheia) e a
 * área de segurança (laranja tracejado). JPEG leve; não vai para a produção.
 */
export async function buildGabaritoPreview(sheets: SheetJob[], opts: { variant: ArtVariant; label: string; maxSide?: number }): Promise<Blob> {
  const maxSide = opts.maxSide ?? 1400;
  const gap = 24;
  const caption = 30;
  const margin = 16;
  const widest = Math.max(...sheets.map((s) => s.page.sheet.w));
  const tallest = sheets.reduce((sum, s) => sum + s.page.sheet.h, 0);
  // px por mm: a folha mais larga cabe em maxSide e a pilha toda em 2 × maxSide de altura.
  const k = Math.min(maxSide / widest, (maxSide * 2 - sheets.length * (gap + caption)) / tallest);
  const dpi = k * 25.4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(widest * k + margin * 2));
  canvas.height = Math.max(1, Math.round(tallest * k + sheets.length * (gap + caption) - gap + margin * 2));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cache = new Map<PieceJob, PieceCanvas>();
  let top = margin;
  for (const sheet of sheets) {
    const { page } = sheet;
    ctx.fillStyle = "#4a4a4a";
    ctx.font = "600 20px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(page.label || "Gabarito", margin, top + caption / 2);
    top += caption;
    const ox = (canvas.width - page.sheet.w * k) / 2;
    ctx.fillStyle = "#f1f1f1";
    ctx.fillRect(ox, top, page.sheet.w * k, page.sheet.h * k);
    for (const job of sheet.panels) {
      const panel = await renderPanel(job, dpi, opts.variant, opts.label, true, cache);
      ctx.drawImage(panel, ox + job.panel.bleed.x * k, top + job.panel.bleed.y * k, job.panel.bleed.w * k, job.panel.bleed.h * k);
      panel.width = 0;
      panel.height = 0;
    }
    // Guias por cima, no referencial da folha (mm).
    ctx.save();
    ctx.translate(ox, top);
    ctx.scale(k, k);
    const line = (color: string, width: number, dash: number[]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width / k;
      ctx.setLineDash(dash.map((d) => d / k));
    };
    for (const { panel } of sheet.panels) {
      line("#38bdf8", 1.5, [6, 4]);
      ctx.strokeRect(panel.bleed.x, panel.bleed.y, panel.bleed.w, panel.bleed.h);
      line("#1a1a1a", 1.5, []);
      if (panel.cut.d) ctx.stroke(new Path2D(panel.cut.d));
      else ctx.strokeRect(panel.cut.x, panel.cut.y, panel.cut.w, panel.cut.h);
      if (panel.safe) {
        line("#f59e0b", 1.5, [6, 4]);
        if (panel.safe.d) ctx.stroke(new Path2D(panel.safe.d));
        else for (const part of panel.safe.parts ?? [panel.safe]) ctx.strokeRect(part.x, part.y, part.w, part.h);
      }
    }
    ctx.restore();
    top += page.sheet.h * k + gap;
  }
  for (const piece of cache.values()) releaseCanvases(piece);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("não foi possível gerar a imagem do gabarito");
  return blob;
}
