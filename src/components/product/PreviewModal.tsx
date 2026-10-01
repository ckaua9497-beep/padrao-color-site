"use client";

import type { MutableRefObject } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import type { ArtSettings } from "@/components/mockup/art";
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
};

function artLabel(art: ArtSettings) {
  if (art.src) return art.text.trim() ? "Imagem enviada + texto" : "Imagem enviada";
  return art.text.trim() ? "Texto da arte" : "Arte de exemplo";
}

export default function PreviewModal({ onClose, onAdd, adding, spec, art, name, fallbackImage, captureRef, summary, total }: Props) {
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
            <dd className="text-right font-semibold">{spec.printable ? artLabel(art) : "Produto sem impressão"}</dd>
          </div>
        </dl>
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
