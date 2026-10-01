"use client";

import { useEffect, type MutableRefObject } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import type { ArtSettings } from "@/components/mockup/art";
import type { MockupSpec } from "@/lib/mockup";
import { IconClose } from "@/components/icons";

type Props = {
  onClose: () => void;
  onAdd: () => void;
  adding: boolean;
  spec: MockupSpec;
  art: ArtSettings;
  name: string;
  captureRef: MutableRefObject<CaptureFn | null>;
  summary: [string, string][];
  total: string;
};

export default function PreviewModal({ onClose, onAdd, adding, spec, art, name, captureRef, summary, total }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/80 p-3 md:p-8" role="dialog" aria-modal="true" aria-label="Pré-visualização do produto">
      <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/90 text-ink transition-colors hover:bg-white">
        <IconClose className="size-5" />
      </button>
      <div className="grid max-h-full w-full max-w-[1080px] animate-fade-up overflow-y-auto rounded-panel bg-white md:grid-cols-[1.35fr_1fr]">
        <Mockup3D spec={spec} art={art} label={name} captureRef={captureRef} className="aspect-square w-full md:aspect-auto md:min-h-[620px]" />
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
              <dd className="text-right font-semibold">{art.src ? "Enviada" : "Arte de exemplo"}</dd>
            </div>
          </dl>
          <div className="mt-auto pt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-muted">Total</span>
              <span className="text-2xl font-black">{total}</span>
            </div>
            <button type="button" onClick={onAdd} disabled={adding} className="flex h-13 w-full items-center justify-center rounded-control bg-coral text-[17px] font-bold text-white transition-colors hover:bg-coral-600 disabled:opacity-60">
              {adding ? "Adicionando…" : "Adicionar ao carrinho"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
