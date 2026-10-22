"use client";

import { useEffect, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { thumbnailOf } from "@/components/mockup/art";
import { IconBrush } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import type { ArtStatus, ItemView, KitShot } from "./kit-art";
import { FotoProduto } from "@/components/FotoProduto";

/** Espera depois do modelo pronto até a foto (a arte termina de pintar na textura). */
const SETTLE_MS = 1100;
/** Desiste de um item que não abre (o card fica com a foto do catálogo). */
const TIMEOUT_MS = 15_000;

export type GalleryItem = { key: string; title: string; image: string; productName: string; view: ItemView; status: ArtStatus };

type Props = {
  items: GalleryItem[];
  shots: Record<string, KitShot>;
  onShot: (itemKey: string, shot: KitShot) => void;
  /** Veio do "Adicionar kit ao carrinho": termina as fotos e adiciona sozinho. */
  adding: boolean;
  onAdd: () => void;
  /** Pede para adicionar quando as fotos terminarem. */
  onAddWhenReady: () => void;
  onEdit: (key: string) => void;
  onClose: () => void;
  perKit: number;
  total: number;
  units: string;
};

const TONE: Record<ArtStatus["tone"], string> = {
  ok: "text-ink",
  own: "text-ink",
  later: "text-muted",
  missing: "text-coral-700",
  blank: "text-muted",
};

/**
 * O kit inteiro com a arte: um card por item com a foto 3D da peça. As que faltam são feitas uma por vez num
 * visualizador só (um contexto WebGL), como a folha de contato da QA; a foto de cada item vai para o carrinho.
 */
export function KitGallery({ items, shots, onShot, adding, onAdd, onAddWhenReady, onEdit, onClose, perKit, total, units }: Props) {
  // Itens que não abriram no 3D (chave da peça e da arte que falhou): seguem com a foto do catálogo.
  const [failed, setFailed] = useState<Record<string, string>>({});
  const captureRef = useRef<CaptureFn | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const photoOf = (item: GalleryItem) => (shots[item.key]?.key === item.view.photoKey ? shots[item.key] : null);
  const pending = items.filter((item) => !photoOf(item) && failed[item.key] !== item.view.photoKey);
  const current = pending[0] ?? null;
  const finished = pending.length === 0;
  const ready = items.length - pending.length;

  const currentKey = current?.key;
  const currentPhoto = current?.view.photoKey;
  const currentKind = current?.view.spec.kind;
  useEffect(() => {
    if (!currentKey || !currentPhoto || !currentKind) return;
    let alive = true;
    const started = performance.now();
    let readyAt = 0;
    const fail = () => alive && setFailed((list) => ({ ...list, [currentKey]: currentPhoto }));
    const timer = window.setInterval(() => {
      const root = stage.current?.querySelector<HTMLElement>("[data-kind]");
      const modelReady = root?.dataset.kind === currentKind && root.dataset.ready === "true";
      const now = performance.now();
      if (modelReady && !readyAt) readyAt = now;
      if (readyAt && now - readyAt >= SETTLE_MS) {
        window.clearInterval(timer);
        const frame = captureRef.current?.() ?? null;
        if (!frame) {
          fail();
          return;
        }
        thumbnailOf(frame, 360)
          .then((src) => alive && onShot(currentKey, { key: currentPhoto, src }))
          .catch(fail);
      } else if (now - started > TIMEOUT_MS) {
        window.clearInterval(timer);
        fail();
      }
    }, 150);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [currentKey, currentPhoto, currentKind, onShot]);

  // Do "Adicionar kit ao carrinho": com todas as fotos prontas (ou que não abriram), o kit vai para o carrinho.
  // Uma vez só, mesmo que o cliente clique em "Adicionar sem esperar as fotos" no mesmo instante.
  const added = useRef(false);
  const addOnce = () => {
    if (added.current) return;
    added.current = true;
    onAdd();
  };
  useEffect(() => {
    if (!adding || !finished || added.current) return;
    added.current = true;
    onAdd();
  }, [adding, finished, onAdd]);

  const progress = finished
    ? "Todos os itens estão com a foto da arte."
    : `Fotografando ${Math.min(ready + 1, items.length)} de ${items.length}: ${current?.title ?? ""}…`;

  return (
    <Dialog open onClose={onClose} label="O kit inteiro com a sua arte" className="max-w-[1180px] p-5 sm:p-8">
      <p className="pr-12 text-sm font-bold uppercase tracking-[0.2em] text-coral-700 md:pr-0">{adding ? "Preparando o carrinho" : "Seu kit"}</p>
      <h2 className="mt-1 pr-12 text-title font-bold md:pr-0">{adding ? "Fotografando cada item com a sua arte" : "Confira cada item com a sua arte"}</h2>
      <p className="mt-2 text-sm text-ink/75" aria-live="polite">
        {progress} {!adding && "Para mudar a arte de um item, toque em Personalizar."}
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          const photo = photoOf(item);
          const live = current?.key === item.key;
          const missed = failed[item.key] === item.view.photoKey;
          return (
            <li key={item.key} className="flex flex-col overflow-hidden rounded-card bg-white ring-1 ring-line">
              <div ref={live ? stage : undefined} className="relative aspect-square bg-mist">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.src} alt={`${item.title} com a arte`} className="size-full object-cover" />
                ) : live ? (
                  <>
                    {/* O 3D renderiza por baixo (a foto sai do canvas); por cima, a foto do catálogo, sem os botões do visualizador. */}
                    <div aria-hidden className="absolute inset-0 opacity-0">
                      <Mockup3D spec={item.view.spec} art={item.view.art} label={item.productName} fallbackImage={item.image} captureRef={captureRef} className="size-full" />
                    </div>
                    <span className="pointer-events-none absolute inset-0 overflow-hidden opacity-50">
                      <FotoProduto src={item.image} alt="" sizes="(max-width: 640px) 45vw, 260px" />
                    </span>
                    <span className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-center gap-2 rounded-full bg-white/90 px-2 py-1 text-caption font-semibold">
                      <Spinner /> Fotografando
                    </span>
                  </>
                ) : (
                  <>
                    <span className={cx("absolute inset-0 overflow-hidden", !missed && "opacity-50")}>
                      <FotoProduto src={item.image} alt="" sizes="(max-width: 640px) 45vw, 260px" />
                    </span>
                    <span className="absolute inset-x-2 bottom-2 rounded-full bg-white/90 px-2 py-1 text-center text-caption font-semibold text-ink/80">
                      {missed ? "Foto do catálogo" : "Na fila"}
                    </span>
                  </>
                )}
              </div>
              <div className="flex flex-1 flex-col p-3">
                <p className="line-clamp-2 text-sm font-bold leading-snug">{item.title}</p>
                <p className={cx("mt-1 text-caption font-semibold", TONE[item.status.tone])}>{item.status.label}</p>
                {item.status.tone !== "blank" && (
                  <button
                    type="button"
                    onClick={() => onEdit(item.key)}
                    className="mt-auto inline-flex min-h-10 items-center gap-1.5 self-start pt-2 text-sm font-semibold underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                  >
                    <IconBrush className="size-4" /> Personalizar<span className="sr-only"> {item.title}</span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
        <p className="tabular-nums">
          <span className="block text-caption text-muted">
            {units} · {formatBRL(perKit)} por kit
          </span>
          <span className="block text-[19px] font-bold">{formatBRL(total)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {adding && !finished && (
            <Button variant="link" size="sm" onClick={addOnce}>
              Adicionar sem esperar as fotos
            </Button>
          )}
          <Button variant="buy" size="md" loading={adding && !finished} onClick={finished ? addOnce : onAddWhenReady}>
            {adding && !finished ? "Preparando as fotos…" : "Adicionar kit ao carrinho"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
