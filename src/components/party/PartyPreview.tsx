"use client";

import { useMemo, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { ArtSettings } from "@/components/mockup/art";
import { IconCube } from "@/components/icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatSize, mockupSpec } from "@/lib/mockup";
import type { PartyItem, PartyPalette, Size } from "@/lib/party";
import type { Selection } from "@/lib/pricing";
import { FotoProduto } from "@/components/FotoProduto";

type Props = {
  item: Pick<PartyItem, "title" | "product"> | null;
  selection: Selection | null;
  /** Medida digitada (produtos por m²): o 3D acompanha. */
  size: Size | null;
  art: ArtSettings;
  palette: PartyPalette;
  id?: string;
  /** Nome da região e legenda (o Monte Seu Kit fala da marca, não da festa). */
  label?: string;
  note?: string;
};

/**
 * Prévia única da página (um canvas WebGL por vez): o item em foco com o nome, a frase e as cores da festa,
 * em 3D ou na foto do catálogo sobre a paleta.
 */
export default function PartyPreview({
  item,
  selection,
  size,
  art,
  palette,
  id,
  label = "Prévia da festa",
  note = "Prévia ilustrativa com o nome, a frase e as cores da festa. A arte final de cada item é combinada com a nossa equipe antes da impressão.",
}: Props) {
  const [mode, setMode] = useState<"3d" | "foto">("3d");
  const spec = useMemo(() => {
    if (!item) return null;
    const { slug, name, categorySlug, options } = item.product;
    const base = mockupSpec({ slug, name, categorySlug, options }, selection ?? {});
    if (!size || size.widthCm <= 0 || size.heightCm <= 0) return base;
    return { ...base, widthCm: size.widthCm, heightCm: size.heightCm, label: formatSize(size.widthCm, size.heightCm) };
  }, [item, selection, size]);

  return (
    <section id={id} aria-label={label} className="scroll-mt-32">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-bold">
          Prévia <span className="font-normal text-muted">· {item ? item.title : "escolha um item"}</span>
        </p>
        <SegmentedControl
          label="Tipo de prévia"
          value={mode}
          onChange={setMode}
          options={[
            {
              value: "3d",
              label: (
                <>
                  <IconCube className="size-4" /> 3D
                </>
              ),
            },
            { value: "foto", label: "Foto" },
          ]}
        />
      </div>
      {/* --lado: lado do quadro, definido pelo painel preso da página (encolhe em telas baixas); sem ele, a largura toda. */}
      {mode === "3d" && item && spec ? (
        <Mockup3D lazy spec={spec} art={art} label={item.title} fallbackImage={item.product.image} className="mx-auto aspect-square w-[var(--lado,100%)] overflow-hidden rounded-card" />
      ) : (
        <PhotoPreview item={item} art={art} palette={palette} />
      )}
      <p className="mt-2 text-caption text-muted">{note}</p>
    </section>
  );
}

function PhotoPreview({ item, art, palette }: { item: Pick<PartyItem, "product"> | null; art: ArtSettings; palette: PartyPalette }) {
  const [first, second] = palette.colors;
  return (
    <div className="relative mx-auto aspect-square w-[var(--lado,100%)] overflow-hidden rounded-card" style={{ background: `linear-gradient(150deg, ${first} 0%, ${second ?? first} 100%)` }}>
      {item && <FotoProduto src={item.product.image} alt={item.product.name} sizes="(max-width: 1024px) 90vw, 400px" respiro="p-8 pb-28" />}
      <div className="absolute inset-x-4 bottom-4 rounded-control px-4 py-3 text-center shadow-card" style={{ background: art.background, color: art.textColor }}>
        <p className="truncate text-lg font-black leading-tight">{art.text}</p>
        {art.subtext && <p className="mt-0.5 truncate text-sm">{art.subtext}</p>}
      </div>
    </div>
  );
}
