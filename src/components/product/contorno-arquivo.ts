import { caminhoSvg, type Contorno, type V2 } from "@/lib/contorno";
import { desenhoDe, linhasDeLed, medidaLed, type LinhaDeLed } from "@/lib/led-linhas";
import type { MockupSpec } from "@/lib/mockup";
import { canvasFor, ledColorName, loadArtFont, loadImage, type ArtSettings } from "@/components/mockup/art";
import { fractionLoops, traceArtContour } from "@/components/mockup/art-contour";

const PT_POR_CM = 72 / 2.54;

/**
 * Arquivo do contorno automático (src/lib/contorno.ts): PDF vetorial no tamanho da peça, só com o caminho em magenta
 * 100% (a cor de linha de corte da produção), no mesmo referencial da arte. Vai no pedido como "Faca de Corte".
 * null quando a arte não tem transparência (corte reto) ou a imagem não abre. O LED do quadro tem o seu: arquivoDeLed.
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
  page.drawSvgPath(d, { x: 0, y: H, borderColor: cmyk(0, 1, 0, 0), borderWidth: 0.5 });
  const bytes = await doc.save();
  return new File([bytes as BlobPart], `faca-de-corte-${slug}.pdf`, { type: "application/pdf" });
}

/** Caminho SVG de uma linha de LED (pontos em fração da área) no tamanho W × H, aberto ou fechado. */
function caminhoDaLinha(linha: LinhaDeLed, W: number, H: number): string {
  const n = (v: number) => String(Math.round(v * 100) / 100);
  return `M${linha.pontos.map(([x, y]: V2) => `${n(x * W)} ${n(y * H)}`).join("L")}${linha.fechada ? "Z" : ""}`;
}

function rgbDe(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  const v = m ? Number.parseInt(m[1], 16) : 0xff4fd8;
  return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/**
 * Arquivo "Posição do Led" do quadro acrílico com LED neon: as linhas de LED (src/lib/led-linhas.ts, as mesmas do 3D e
 * do editor), no tamanho da peça e no referencial da arte.
 *   - Página 1: todas as linhas em magenta 100% (a cor de linha da produção), abertas ou fechadas.
 *   - Página 2: cada linha na cor do LED dela, com o número, e a legenda (número, cor, origem e comprimento).
 * `linhas` volta junto para o resumo do pedido. null quando a imagem não abre.
 */
export async function arquivoDeLed(art: ArtSettings, spec: MockupSpec, contorno: Contorno, label: string, slug: string): Promise<{ file: File; linhas: LinhaDeLed[] } | null> {
  const render = { ...art, kind: spec.kind, ledColors: undefined, surface: spec.baseColor };
  await loadArtFont(render);
  const image = art.src ? await loadImage(art.src).catch(() => null) : null;
  if (art.src && !image) return null;
  const traced = traceArtContour(canvasFor(spec.widthCm / spec.heightCm, 1536), render, image, label, spec.widthCm, contorno.margemCm, contorno.bordaCm);
  const medida = { widthCm: spec.widthCm, heightCm: spec.heightCm };
  const linhas = linhasDeLed(desenhoDe(art), traced ? fractionLoops(traced) : null, traced?.cheio ?? false, medida, spec.ledColors[0] ?? "#ff4fd8");
  if (!linhas.length) return null;

  const { PDFDocument, StandardFonts, cmyk, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`${contorno.anexo} — ${label}`);
  doc.setCreator("Padrão Color (site)");
  const W = spec.widthCm * PT_POR_CM;
  const H = spec.heightCm * PT_POR_CM;

  const producao = doc.addPage([W, H]);
  // drawSvgPath usa o y do SVG (para baixo) a partir do canto de cima.
  for (const linha of linhas) producao.drawSvgPath(caminhoDaLinha(linha, W, H), { x: 0, y: H, borderColor: cmyk(0, 1, 0, 0), borderWidth: 1 });

  const cores = doc.addPage([W, H]);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const tam = Math.max(8, Math.min(W, H) / 60);
  for (const linha of linhas) {
    const [r, g, b] = rgbDe(linha.cor);
    cores.drawSvgPath(caminhoDaLinha(linha, W, H), { x: 0, y: H, borderColor: rgb(r, g, b), borderWidth: Math.max(2, tam / 4) });
  }
  for (const linha of linhas) {
    const [x, y] = linha.pontos[0];
    const cx = x * W;
    const cy = H - y * H;
    cores.drawCircle({ x: cx, y: cy, size: tam * 0.75, color: rgb(0.1, 0.1, 0.1), borderColor: rgb(1, 1, 1), borderWidth: 0.75 });
    const numero = String(linha.n);
    cores.drawText(numero, { x: cx - negrito.widthOfTextAtSize(numero, tam * 0.85) / 2, y: cy - tam * 0.3, size: tam * 0.85, font: negrito, color: rgb(1, 1, 1) });
  }
  const legenda = [
    `${contorno.anexo}: ${linhas.length} ${linhas.length === 1 ? "linha" : "linhas"} de LED, cada uma numa cor`,
    ...linhas.map((l) => `${l.n} — ${ledColorName(l.cor)} (${l.cor}) · ${l.origem === "pincel" ? (l.fechada ? "desenhada, fechada" : "desenhada, aberta") : l.origem} · ${medidaLed(l.comprimentoCm)}`),
  ];
  const linhaAltura = tam * 1.35;
  const largura = Math.max(...legenda.map((t, i) => (i ? fonte : negrito).widthOfTextAtSize(t, tam))) + tam * 1.6;
  const altura = legenda.length * linhaAltura + tam;
  cores.drawRectangle({ x: tam, y: H - tam - altura, width: Math.min(largura, W - tam * 2), height: altura, color: rgb(1, 1, 1), opacity: 0.9, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
  legenda.forEach((texto, i) => cores.drawText(texto, { x: tam * 1.8, y: H - tam - tam * 0.5 - (i + 1) * linhaAltura + tam * 0.3, size: tam, font: i ? fonte : negrito, color: rgb(0.1, 0.1, 0.1), maxWidth: W - tam * 3.6 }));

  const bytes = await doc.save();
  return { file: new File([bytes as BlobPart], `posicao-do-led-${slug}.pdf`, { type: "application/pdf" }), linhas };
}
