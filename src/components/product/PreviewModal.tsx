"use client";

import type { MutableRefObject } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { ART_FONTS, artFamily, styleLabel, type ArtSettings } from "@/components/mockup/art";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { MockupSpec } from "@/lib/mockup";

type Props = {
  onClose: () => void;
  onAdd: () => void;
  adding: boolean;
  spec: MockupSpec;
  art: ArtSettings;
  name: string;
  fallbackImage?: string;
  captureRef: MutableRefObject<CaptureFn | null>;
  summary: [string, string][];
  total: string;
  /** Detalhes da arte (artSummary): texto, subtexto, estilo, fonte e cores. */
  artDetails?: Record<string, string>;
};

function artLabel(art: ArtSettings) {
  const typed = art.text.trim() || (art.subtext ?? "").trim();
  if (art.src) return typed ? "Imagem enviada + texto" : "Imagem enviada";
  return typed ? "Texto no template" : "Arte de exemplo";
}

/** Cartão "Sua arte": o texto na própria fonte, o estilo e as cores, para conferir antes de comprar. */
function ArtCard({ art, details, blank, neon }: { art: ArtSettings; details: Record<string, string>; blank: boolean; neon: boolean }) {
  const text = details["Texto da arte"];
  const subtext = details.Subtexto;
  const font = ART_FONTS[art.font] ?? ART_FONTS.figtree;
  const swatches: [string, string][] = neon ? [] : [["Texto", art.textColor], ...(details.Fundo ? [["Fundo", art.background] as [string, string]] : [])];
  return (
    <div className="mt-6 rounded-card bg-mist p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption font-bold uppercase tracking-wider text-muted">{blank ? "Simulação da arte" : "Sua arte"}</span>
        <Badge tone="neutral">Estilo {styleLabel(art.style)}</Badge>
      </div>
      {text && (
        <p className="mt-3 break-words text-2xl leading-tight" style={{ fontFamily: font.family ?? "var(--font-figtree)", fontWeight: font.weight }}>
          {text}
        </p>
      )}
      {subtext && <p className="mt-1 break-words text-sm text-muted">{subtext}</p>}
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-caption">
        {details.Fonte && (
          <div className="flex gap-1">
            <dt className="text-muted">Fonte</dt>
            <dd className="font-semibold">{details.Fonte}</dd>
          </div>
        )}
        {swatches.map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <dt className="text-muted">{key}</dt>
            <dd className="flex items-center gap-1.5 font-semibold">
              <span className="size-3.5 rounded-full ring-1 ring-black/15" style={{ background: color }} aria-hidden />
              {key === "Texto" ? details["Cor do texto"] : details.Fundo}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function PreviewModal({ onClose, onAdd, adding, spec, art, name, fallbackImage, captureRef, summary, total, artDetails }: Props) {
  const showArt = artDetails && Object.keys(artDetails).length > 0;
  return (
    <Dialog open onClose={onClose} label="Pré-visualização do produto" className="grid max-w-[1080px] md:grid-cols-[1.35fr_1fr]">
      <Mockup3D spec={spec} art={art} label={name} fallbackImage={fallbackImage} captureRef={captureRef} className="aspect-square w-full md:aspect-auto md:min-h-[620px]" />
      <div className="flex flex-col p-7">
        <p className="text-lg font-bold">Veja como ficou o seu produto</p>
        <p className="mt-1 text-sm italic text-muted">Gire, aproxime e confira as medidas. Se estiver tudo certo, adicione ao carrinho.</p>
        <dl className="mt-6 space-y-2.5 text-sm">
          {summary.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-line pb-2.5">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right font-semibold">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 pt-1">
            <dt className="text-muted">Arte</dt>
            <dd className="text-right font-semibold">{spec.blank ? "Simulação · vendido sem impressão" : artLabel(art)}</dd>
          </div>
        </dl>
        {showArt && <ArtCard art={art} details={artDetails} blank={spec.blank} neon={artFamily(spec.kind) === "neon"} />}
        <div className="mt-auto pt-8">
          <div className="mb-3 flex items-baseline justify-between tabular-nums">
            <span className="text-sm text-muted">Total</span>
            <span className="text-2xl font-black">{total}</span>
          </div>
          <Button variant="buy" size="lg" block loading={adding} onClick={onAdd}>
            {adding ? "Adicionando…" : "Adicionar ao carrinho"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
