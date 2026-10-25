"use client";

import { useEffect, useMemo, useState } from "react";
import { hasArtContent, sourceSizeOf, type ArtSettings, type ArtVariant } from "@/components/mockup/art";
import { Notice } from "@/components/facade/parts";
import { IconDownload } from "@/components/facade/icons";
import { Button } from "@/components/ui/Button";
import { boxFromPlacement, croppedShare, describePanel, formatMm, piecesOf, sideOf, type Box, type Sides, type TemplatePage } from "@/lib/templates";
import { isAutoFit, printFileName, printSheets, type Gabarito } from "./jobs";
import { TemplateLegend, TemplateSheet } from "./TemplateSheet";

type Props = {
  gabarito: Gabarito;
  art: ArtSettings;
  side: "front" | "back";
  variant: ArtVariant;
  label: string;
  slug: string;
  /** Arquivo anexado que o site não lê (CDR, AI, PDF ilegível): vai como foi enviado, sem PDF no gabarito. */
  attachedOnly?: boolean;
};

/** Até quantas folhas a prévia mostra (camisas com muitos tamanhos: o arquivo leva todas). */
const MAX_PREVIEW_SHEETS = 3;
/** Lado maior da prévia de cada folha, em pixels. */
const PREVIEW_PX = 520;

/**
 * Bloco "Gabarito" do passo da arte: medidas oficiais da peça, como o arquivo enviado foi encaixado,
 * prévia das folhas com a arte (quando o gabarito tem várias peças ou tamanhos) e o PDF de impressão.
 */
export function GabaritoPanel({ gabarito, art, side, variant, label, slug, attachedOnly = false }: Props) {
  const current = side === "back" ? gabarito.back : gabarito.front;
  const sideArt = side === "back" ? (art.back ?? null) : art;
  const panel = current?.ref.panel ?? null;
  const facts = panel ? describePanel(panel) : null;
  const sheets = useMemo(() => printSheets(gabarito, art), [gabarito, art]);
  // Prévia da folha quando há mais de uma peça: tamanhos, frente e verso, faces de um tecido só.
  const multi = gabarito.printPages.length > 1 || gabarito.pages.some((p) => piecesOf(p).length > 1 || p.panels.length > 1);
  const showSheets = multi || !current?.frame;
  const previewSheets = sheets.slice(0, MAX_PREVIEW_SHEETS);
  const hidden = sheets.length - previewSheets.length;
  const hasArt = !attachedOnly && (hasArtContent(art) || hasArtContent(art.back));

  // Prévia: pinta cada painel com a cópia reduzida da arte (rápido) e mostra na folha do gabarito.
  const [previews, setPreviews] = useState<{ key: string; images: (string | null)[][] } | null>(null);
  // Chave leve: sem copiar as imagens (data URLs de vários MB) a cada quadro do arraste.
  const previewKey = useMemo(() => JSON.stringify([previewSheets.map((s) => s.page.id), lightArt(art)]), [previewSheets, art]);
  useEffect(() => {
    if (!showSheets || !hasArt || !previewSheets.length) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      const { renderPanel } = await import("./print-file");
      const images: (string | null)[][] = [];
      const cache = new Map();
      for (const sheet of previewSheets) {
        const dpi = (PREVIEW_PX / Math.max(sheet.page.sheet.w, sheet.page.sheet.h)) * 25.4;
        const row: (string | null)[] = [];
        for (const job of sheet.panels) {
          if (!job.pieces.some((piece) => piece.art)) {
            row.push(null);
            continue;
          }
          try {
            const canvas = await renderPanel(job, dpi, variant, label, true, cache);
            row.push(canvas.toDataURL("image/png"));
          } catch {
            row.push(null);
          }
        }
        images.push(row);
        if (!alive) return;
      }
      if (alive) setPreviews({ key: previewKey, images });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [showSheets, hasArt, previewSheets, previewKey, variant, label]);
  // Enquanto a prévia nova pinta, a anterior continua à vista (sem piscar a cada ajuste).
  const images = previews?.images ?? null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const [{ buildPrintPdf }, { saveBlob }] = await Promise.all([import("./print-file"), import("./print-store")]);
      const blob = await buildPrintPdf(sheets, { title: `${label} — arte no gabarito`, variant, label, transparent: gabarito.transparent });
      saveBlob(blob, printFileName(slug));
    } catch {
      setError("Não conseguimos gerar o PDF agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  // Como o arquivo do cliente entrou no gabarito (lado em edição) — enquanto a posição for a do encaixe.
  const auto = isAutoFit(sideArt, current);
  const fit = auto ? (sideArt?.templateFit?.match ?? null) : null;
  const moved = Boolean(sideArt?.templateFit && sideArt.src && sideArt.templateFit.src === sideArt.src && !auto);
  let cropped = 0;
  const placement = sideArt?.layout?.image;
  if (fit && panel && placement && sideArt?.layout?.overflow) {
    const aspect = imageAspectOf(sideArt);
    if (aspect) cropped = croppedShare(visualBox(boxFromPlacement(placement, panel.cut, aspect), placement.rotation), panel.bleed);
  }
  const previewVisible = showSheets && hasArt && previewSheets.length > 0;

  return (
    <section aria-labelledby="gabarito-titulo" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p id="gabarito-titulo" className="text-[15px] font-bold">
          Gabarito oficial
        </p>
        <p className="text-caption text-muted">medidas do arquivo de gabarito da Padrão Color</p>
      </div>

      {facts && panel && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact term="Tamanho final" value={facts.final} />
          <Fact term="Sangria" value={facts.bleed ?? "sem sangria"} />
          <Fact term="Área de segurança (da borda)" value={facts.safe ?? "—"} />
          <Fact term="Arquivo com sangria" value={`${formatMm(panel.bleed.w)} × ${formatMm(panel.bleed.h)}`} />
        </dl>
      )}
      {facts?.shape && <p className="text-caption text-muted">Peça com {facts.shape}: a faca segue a linha preta do gabarito.</p>}

      {/* Região ao vivo sempre montada: o leitor de tela anuncia quando o encaixe muda. */}
      <div role="status" aria-live="polite" className="grid gap-3 empty:hidden">
        {fit === "sheet" && (
          <Notice tone="ok">
            Reconhecemos a folha do gabarito no seu arquivo: a arte entrou na posição exata, 1:1{gabarito.pages.some((p) => piecesOf(p).length > 1) ? ", e cada peça da folha recebe o pedaço dela" : ""}.
          </Notice>
        )}
        {fit === "bleed" && (
          <Notice tone="ok">
            Arquivo no tamanho com sangria{panel ? ` (${formatMm(panel.bleed.w)} × ${formatMm(panel.bleed.h)})` : ""}: encaixado 1:1 no gabarito.
          </Notice>
        )}
        {fit === "trim" && (
          <Notice tone="ok">
            Arquivo no tamanho final, sem sangria: estendemos as bordas{panel ? ` até ${formatMm(maxSide(panel.metrics.bleedMm))}` : ""} para o corte não deixar filete branco.
          </Notice>
        )}
        {fit === "other" && (
          <Notice tone="warn">
            {cropped > 0.005 ? (
              <>
                A proporção do arquivo é diferente da peça. Ampliamos a imagem para cobrir a sangria: <strong className="tabular-nums">{Math.round(cropped * 100)}%</strong> dela fica de
                fora e é aparada. Para ver a imagem inteira, use “Inteira na área segura” acima.
              </>
            ) : (
              <>A proporção do arquivo é diferente da peça: a imagem ficou inteira dentro da área de segurança e o fundo completa o resto.</>
            )}
          </Notice>
        )}
        {moved && <Notice tone="info">Posição ajustada por você. “Voltar ao encaixe automático”, no editor, refaz o encaixe no gabarito.</Notice>}
      </div>
      {attachedOnly && (
        <Notice tone="info">Seu arquivo vai anexado ao pedido do jeito que foi enviado. O encaixe automático no gabarito vale para PNG, JPG, WEBP e PDF.</Notice>
      )}
      {current && !current.frame && hasArt && (
        <Notice tone="info">No arquivo de impressão a arte é encaixada no gabarito cobrindo a sangria{previewVisible ? ", como na prévia abaixo" : ""}.</Notice>
      )}

      {previewVisible && (
        <div className="grid gap-3 sm:grid-cols-2">
          {previewSheets.map((sheet, i) => (
            <figure key={sheet.page.id} className="grid gap-1.5 rounded-control bg-mist p-2">
              <TemplateSheet page={sheet.page} images={images?.[i] ?? undefined} title={`Folha do gabarito: ${sheetLabel(sheet.page)}`} />
              <figcaption className="text-caption text-muted">{sheetLabel(sheet.page)}</figcaption>
            </figure>
          ))}
          {hidden > 0 && <p className="self-center text-caption text-muted">+ {hidden} {hidden === 1 ? "folha" : "folhas"} no arquivo (outros tamanhos ou peças).</p>}
        </div>
      )}

      <TemplateLegend sew={gabarito.pages.some((p) => p.panels.some((q) => q.sew))} />

      {hasArt && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="outline" size="sm" loading={busy} onClick={download} icon={<IconDownload className="size-4" />}>
            {busy ? "Gerando PDF…" : "Baixar arte no gabarito (PDF)"}
          </Button>
          <p className="text-caption text-muted">PDF no tamanho real, sem as linhas do gabarito. Guarde: é ele que você envia se a Padrão Color pedir a arte.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-coral-700">
          {error}
        </p>
      )}
    </section>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-control bg-mist px-3 py-2">
      <dt className="text-caption text-muted">{term}</dt>
      <dd className="text-sm font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function sheetLabel(page: TemplatePage): string {
  const names = page.panels.map((panel, i) => panel.name ?? (sideOf(page, panel, i) === "back" ? "Verso" : null)).filter(Boolean);
  return [page.label, names.length > 1 ? names.join(", ") : null].filter(Boolean).join(" · ");
}

/** Caixa que a imagem ocupa na tela (girada 90° ou 270°, os lados se trocam em volta do mesmo centro). */
function visualBox(b: Box, rotation: number): Box {
  return Math.abs(rotation) % 180 === 90 ? { x: b.x + (b.w - b.h) / 2, y: b.y + (b.h - b.w) / 2, w: b.h, h: b.w } : b;
}

const maxSide = (s: Sides) => Math.max(s.top, s.right, s.bottom, s.left);

/** A arte sem as imagens (só um resumo delas): chave barata para refazer a prévia. */
function lightArt(art: ArtSettings): unknown {
  const src = (value: string | null | undefined) => (value ? `${value.length}:${value.slice(-48)}` : null);
  return { ...art, src: src(art.src), back: art.back ? { ...art.back, src: src(art.back.src) } : null };
}

/** Proporção da imagem enviada (largura ÷ altura), pela medida original registrada no envio. */
function imageAspectOf(art: ArtSettings): number | null {
  const size = sourceSizeOf(art.src);
  return size && size.h > 0 ? size.w / size.h : null;
}
