"use client";

import { useMemo, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import { DEFAULT_ART, fileToDataUrl, type ArtSettings } from "@/components/mockup/art";
import { mockupSpec, type MockupProduct } from "@/lib/mockup";
import { KIND_INFO } from "@/lib/mockup-kinds";
import { cleanOptionLabel, optionKeys, type Selection } from "@/lib/pricing";

/** Visualizador da galeria de QA: um produto, suas opções e a spec resultante. */
export default function MockupInspector({ product }: { product: MockupProduct & { slug: string; image?: string } }) {
  const keys = useMemo(() => optionKeys(product.options), [product.options]);
  const [selection, setSelection] = useState<Selection>({});
  const [art, setArt] = useState<ArtSettings>(DEFAULT_ART);
  const [artError, setArtError] = useState<string | null>(null);
  const spec = useMemo(() => mockupSpec(product, selection), [product, selection]);

  return (
    <div className="grid gap-5">
      <Mockup3D spec={spec} art={art} label={product.name} fallbackImage={product.image} className="aspect-square w-full" />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 font-semibold text-white">
          Testar com uma imagem
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setArt({ ...DEFAULT_ART, src: await fileToDataUrl(file) });
                setArtError(null);
              } catch {
                setArtError("Não foi possível ler essa imagem.");
              }
            }}
          />
        </label>
        {art.src && (
          <button type="button" onClick={() => setArt(DEFAULT_ART)} className="rounded-full bg-mist px-4 py-2 font-semibold">
            Voltar à arte de exemplo
          </button>
        )}
        {artError && <span role="alert" className="text-coral-700">{artError}</span>}
      </div>

      {keys.length > 0 && (
        <div className="grid gap-4">
          {keys.map((key) => (
            <fieldset key={key}>
              <legend className="mb-2 text-sm font-bold">{cleanOptionLabel(key)}</legend>
              <div className="flex flex-wrap gap-1.5">
                {product.options[key].map((value) => {
                  const active = (selection[key] ?? product.options[key][0]) === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelection((s) => ({ ...s, [key]: value }))}
                      className={`rounded-full px-3 py-1.5 text-[13px] ${active ? "bg-ink font-semibold text-white" : "bg-mist hover:bg-fog"}`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-card bg-mist p-4 text-[13px]">
        <dt className="font-bold">Tipo</dt>
        <dd>
          {spec.kind} · {KIND_INFO[spec.kind].label} <span className="text-muted">({spec.source})</span>
        </dd>
        <dt className="font-bold">Medida</dt>
        <dd>
          {spec.label} {KIND_INFO[spec.kind].sizeIsArtArea ? "(área de arte)" : ""}
        </dd>
        <dt className="font-bold">Recebe arte</dt>
        <dd>{spec.printable ? "sim" : "não"}</dd>
        <dt className="font-bold">Spec</dt>
        <dd>
          <pre className="whitespace-pre-wrap break-all font-mono text-[12px]">
            {JSON.stringify({ ...spec, kind: undefined, source: undefined, label: undefined, printable: undefined }, null, 1)}
          </pre>
        </dd>
      </dl>
    </div>
  );
}
