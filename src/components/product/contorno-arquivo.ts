import { caminhoSvg, type Contorno } from "@/lib/contorno";
import type { MockupSpec } from "@/lib/mockup";
import { canvasFor, loadArtFont, loadImage, type ArtSettings } from "@/components/mockup/art";
import { traceArtContour } from "@/components/mockup/art-contour";

const PT_POR_CM = 72 / 2.54;

/**
 * Arquivo do contorno automático (src/lib/contorno.ts): PDF vetorial no tamanho da peça, só com o caminho em magenta
 * 100% (a cor de linha de corte da produção), no mesmo referencial da arte. Vai no pedido como "Faca de Corte" ou
 * "Posição do Led". null quando a arte não tem transparência (corte reto, LED na moldura) ou a imagem não abre.
 * `art` é a mesma do 3D (renderArt, sem fundo); `label`, o nome do produto que o 3D recebe.
 */
export async function arquivoDeContorno(art: ArtSettings, spec: MockupSpec, contorno: Contorno, label: string, slug: string): Promise<File | null> {
  const render = { ...art, kind: spec.kind, ledColors: art.ledColors?.length ? art.ledColors : spec.ledColors, surface: spec.baseColor };
  await loadArtFont(render);
  const image = art.src ? await loadImage(art.src).catch(() => null) : null;
  if (art.src && !image) return null;
  const traced = traceArtContour(canvasFor(spec.widthCm / spec.heightCm, 1536), render, image, label, spec.widthCm, contorno.margemCm, contorno.bordaCm);
  if (!traced || traced.cheio) return null;

  const { PDFDocument, cmyk } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`${contorno.anexo} — ${label}`);
  doc.setCreator("Padrão Color (site)");
  const W = spec.widthCm * PT_POR_CM;
  const H = spec.heightCm * PT_POR_CM;
  const page = doc.addPage([W, H]);
  const d = caminhoSvg(traced.loops, ([x, y]) => [((x + 0.5) / traced.W) * W, ((y + 0.5) / traced.H) * H]);
  // drawSvgPath usa o y do SVG (para baixo) a partir do canto de cima.
  page.drawSvgPath(d, { x: 0, y: H, borderColor: cmyk(0, 1, 0, 0), borderWidth: contorno.tipo === "led" ? 1 : 0.5 });
  const bytes = await doc.save();
  const nome = `${contorno.tipo === "faca" ? "faca-de-corte" : "posicao-do-led"}-${slug}.pdf`;
  return new File([bytes as BlobPart], nome, { type: "application/pdf" });
}
