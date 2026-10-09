"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { thumbnailOf } from "@/components/mockup/art";
import { IconCube, IconGrid } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { imageUrl } from "@/lib/format";
import type { PartyProduct } from "@/lib/party";
import type { ItemView, KitShot } from "./kit-art";

/** Espera, depois do modelo pronto e da última mudança na arte, até a foto (a textura termina de pintar). */
const SETTLE_MS = 1600;
const GIVE_UP_MS = 30_000;

type Props = {
  id?: string;
  /** Item em foco, com a arte que vale para ele. */
  view: ItemView | null;
  title: string | null;
  product: Pick<PartyProduct, "name" | "image"> | null;
  /** Foto 3D guardada do item (vale só com a chave atual). */
  shot: KitShot | null;
  /** Um editor ou a galeria estão abertos: um canvas WebGL por vez, então aqui fica a foto. */
  paused: boolean;
  onShot: (itemKey: string, shot: KitShot) => void;
  onGallery: () => void;
};

/**
 * Prévia do kit (coluna do resumo): o item em foco em 3D com a arte dele, ou a foto do catálogo. Quando o modelo
 * fica pronto e a arte para de mudar, guarda a foto do ângulo do carrinho (miniatura do card e do carrinho).
 */
export default function KitPreview({ id, view, title, product, shot, paused, onShot, onGallery }: Props) {
  const [mode, setMode] = useState<"3d" | "foto">("3d");
  const captureRef = useRef<CaptureFn | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const current = view && shot?.key === view.photoKey ? shot : null;

  const itemKey = view?.key;
  const key = view?.photoKey;
  const kind = view?.spec.kind;
  const photographed = Boolean(current);
  useEffect(() => {
    if (paused || mode !== "3d" || !itemKey || !key || !kind || photographed) return;
    let alive = true;
    const started = performance.now();
    let readyAt = 0;
    const timer = window.setInterval(() => {
      const root = stage.current?.querySelector<HTMLElement>("[data-kind]");
      const ready = root?.dataset.kind === kind && root.dataset.ready === "true";
      const now = performance.now();
      if (ready && !readyAt) readyAt = now;
      if (readyAt && now - readyAt >= SETTLE_MS && now - started >= SETTLE_MS) {
        window.clearInterval(timer);
        const frame = captureRef.current?.() ?? null;
        if (frame)
          thumbnailOf(frame, 360)
            .then((src) => alive && onShot(itemKey, { key, src }))
            .catch(() => undefined);
      } else if (now - started > GIVE_UP_MS) {
        window.clearInterval(timer);
      }
    }, 200);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [paused, mode, itemKey, key, kind, photographed, onShot]);

  return (
    <section id={id} aria-label="Prévia do kit" className="scroll-mt-32">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-bold">
          Prévia <span className="font-normal text-muted">· {title ?? "escolha um item"}</span>
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
      <div ref={stage}>
        {view && product && mode === "3d" && !paused ? (
          <Mockup3D lazy spec={view.spec} art={view.art} label={product.name} fallbackImage={product.image} captureRef={captureRef} className="aspect-square w-full overflow-hidden rounded-card" />
        ) : (
          <div className="relative aspect-square w-full overflow-hidden rounded-card bg-mist">
            {mode === "3d" && current ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.src} alt={title ? `${title} com a arte` : ""} className="size-full object-cover" />
            ) : product ? (
              <Image src={imageUrl(product.image)} alt={product.name} fill sizes="(max-width: 1024px) 90vw, 400px" className="object-contain p-8" />
            ) : null}
          </div>
        )}
      </div>
      <p className="mt-2 text-caption text-muted">Prévia com a arte de cada item. A equipe confere os arquivos antes de imprimir.</p>
      <Button variant="outline" size="sm" block className="mt-3" icon={<IconGrid className="size-4" />} onClick={onGallery}>
        Ver o kit inteiro com a arte
      </Button>
    </section>
  );
}
