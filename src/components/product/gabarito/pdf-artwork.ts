import { registerSource } from "@/components/mockup/art";

/*
 * Arte enviada em PDF: a primeira página vira a imagem do mockup e do editor (PNG de até 2048 px) e o
 * arquivo original fica registrado (com a medida física da página, em mm) para o encaixe no gabarito e para
 * o arquivo de impressão, que renderiza a página de novo na resolução final. O pdf.js só carrega aqui.
 */

const PT_MM = 25.4 / 72;

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

async function pdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist").then((lib) => {
    if (!lib.GlobalWorkerOptions.workerSrc) {
      lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    }
    return lib;
  });
  return pdfjsPromise;
}

async function openPdf(file: Blob) {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = lib.getDocument({ data });
  try {
    return await task.promise;
  } catch (error) {
    // PDF corrompido ou com senha: encerra o worker do pdf.js em vez de deixá-lo vivo.
    void task.destroy();
    throw error;
  }
}

/** Lê a primeira página do PDF: imagem reduzida (data URL), medida da página em mm e número de páginas. */
export async function readPdfArtwork(file: File, maxSide = 2048): Promise<{ src: string; mm: { w: number; h: number }; pages: number }> {
  const doc = await openPdf(file);
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const mm = { w: base.width * PT_MM, h: base.height * PT_MM };
    const scale = Math.min(maxSide / Math.max(base.width, base.height), 8);
    const canvas = await renderPage(page, scale);
    const src = canvas.toDataURL("image/png");
    // "Pixels" de um PDF: a página a 300 dpi (o vetor não perde qualidade; imagens dentro dele seguem o original).
    registerSource(src, { w: Math.round((mm.w / 25.4) * 300), h: Math.round((mm.h / 25.4) * 300), file, kind: "pdf", mm });
    return { src, mm, pages: doc.numPages };
  } finally {
    void doc.loadingTask.destroy();
  }
}

/** Renderiza a primeira página do PDF numa medida em pixels (arquivo de impressão). */
export async function renderPdfFirstPage(file: Blob, px: { w: number; h: number }): Promise<HTMLCanvasElement> {
  const doc = await openPdf(file);
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    return await renderPage(page, Math.min(px.w / base.width, px.h / base.height));
  } finally {
    void doc.loadingTask.destroy();
  }
}

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<typeof openPdf>>["getPage"]>>;

async function renderPage(page: PdfPage, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  // Fundo branco: PDF sem fundo não vira transparência no papel.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}
