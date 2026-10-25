import { piecesOf, pixelsFor } from "@/lib/templates";
import type { MockupSpec } from "@/lib/mockup";
import { destinoDoVerniz } from "@/lib/verniz";
import { loadArtFont, loadImage, paintArt, type ArtSettings } from "@/components/mockup/art";
import { printSheets, type Gabarito } from "./gabarito/jobs";
import { buildPrintPdf, printDpi, type SheetJob } from "./gabarito/print-file";

/** A arte (e o verso e as outras superfícies) pintada como máscara de verniz, sobre branco. */
function maskOf(art: ArtSettings): ArtSettings {
  const mask = (a: ArtSettings): ArtSettings => ({ ...a, varnishMask: "black", background: "#ffffff" });
  return {
    ...mask(art),
    back: art.back ? mask(art.back) : null,
    faces: art.faces ? Object.fromEntries(Object.entries(art.faces).map(([id, face]) => [id, mask(face)])) : null,
  };
}

/** Folha do verso: a cópia "#verso" do gabarito de folha única ou a folha só com peças do verso. */
function isBackSheet(sheet: SheetJob): boolean {
  const pieces = piecesOf(sheet.page);
  return sheet.page.id.endsWith("#verso") || (pieces.length > 0 && pieces.every((p) => p.side === "back"));
}

/** PDF de uma página no tamanho da peça (sem gabarito: lona, adesivo, quadro com LED). */
async function pieceMaskPdf(art: ArtSettings, spec: MockupSpec, label: string): Promise<Blob> {
  const box = { w: spec.widthCm * 10, h: spec.heightCm * 10 };
  const px = pixelsFor(box, printDpi(box));
  const canvas = document.createElement("canvas");
  canvas.width = px.w;
  canvas.height = px.h;
  await loadArtFont(art);
  const image = art.src ? await loadImage(art.src).catch(() => null) : null;
  paintArt(canvas, "front", { ...art, kind: spec.kind, ledColors: art.ledColors ?? undefined, aspect: spec.widthCm / spec.heightCm, sample: false }, image, label);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("não foi possível gerar a máscara");
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`Máscara de verniz — ${label}`);
  doc.setCreator("Padrão Color (site)");
  const mmToPt = (mm: number) => (mm / 25.4) * 72;
  const page = doc.addPage([mmToPt(box.w), mmToPt(box.h)]);
  const png = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
  page.drawImage(png, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  const bytes = await doc.save({ useObjectStreams: false });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/**
 * Máscaras de verniz localizado para a produção (src/lib/verniz.ts): preto onde vai o verniz, na mesma folha e posição
 * do arquivo de impressão (gabarito) ou no tamanho da peça. Uma por tipo de anexo que a variação aceita e o cliente não
 * mandou (`enviados`). `art` é a do pedido (renderArt).
 */
export async function arquivosDeVerniz({
  art,
  spec,
  gabarito,
  anexos,
  enviados,
  label,
  slug,
}: {
  art: ArtSettings;
  spec: MockupSpec;
  gabarito: Gabarito | null;
  anexos: readonly string[];
  enviados: Record<string, File>;
  label: string;
  slug: string;
}): Promise<{ file: File; tipo: string }[]> {
  const destino = destinoDoVerniz(anexos);
  if (!destino) return [];
  const nome = (lado: string) => `mascara-de-verniz${lado ? `-${lado}` : ""}-${slug.replace(/^\d+-/, "").slice(0, 50)}.pdf`;
  const file = (blob: Blob, lado: string) => new File([blob], nome(lado), { type: "application/pdf" });
  const mask = maskOf(art);
  const out: { file: File; tipo: string }[] = [];
  if (!gabarito) {
    const tipo = destino.juntos ? destino.tipo : destino.frente;
    if (tipo && !enviados[tipo]) out.push({ file: file(await pieceMaskPdf(mask, spec, label), ""), tipo });
    return out;
  }
  const sheets = printSheets(gabarito, mask);
  const title = `Máscara de verniz — ${label}`;
  const pdf = (list: SheetJob[]) => buildPrintPdf(list, { title, variant: "front", label, transparent: false });
  if (destino.juntos) {
    if (!enviados[destino.tipo] && sheets.length) out.push({ file: file(await pdf(sheets), ""), tipo: destino.tipo });
    return out;
  }
  const front = sheets.filter((sheet) => !isBackSheet(sheet));
  const back = sheets.filter(isBackSheet);
  if (destino.frente && !enviados[destino.frente] && front.length) out.push({ file: file(await pdf(front), "frente"), tipo: destino.frente });
  if (destino.verso && !enviados[destino.verso] && back.length) out.push({ file: file(await pdf(back), "verso"), tipo: destino.verso });
  return out;
}
