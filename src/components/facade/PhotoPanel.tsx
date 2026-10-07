"use client";

import { useRef, useState, type DragEvent } from "react";
import { IconClose, IconPlus, IconUpload } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cx } from "@/components/ui/cx";
import { MAX_FILE_MB, MAX_PHOTOS, type Quad } from "@/lib/facade";
import type { LoadedImage } from "./canvas";
import { IconStore } from "./icons";

export type Photo = LoadedImage & {
  id: string;
  name: string;
  /** Marcação pronta (foto de exemplo). */
  preset?: Quad;
};

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

/** Lê os arquivos do campo e limpa o campo (para aceitar o mesmo arquivo de novo). */
function takeFiles(input: HTMLInputElement): File[] {
  const files = Array.from(input.files ?? []);
  input.value = "";
  return files;
}

function useDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (event: DragEvent) => {
        event.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        setOver(false);
        onFiles(Array.from(event.dataTransfer.files ?? []));
      },
    },
  };
}

/** Estado vazio do palco: enviar fotos (ou arrastar) ou testar com a foto de exemplo. */
export function PhotoDropzone({ onFiles, onDemo, busy }: { onFiles: (files: File[]) => void; onDemo: () => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const drop = useDrop(onFiles);

  return (
    <div
      {...drop.props}
      className={cx(
        "grid justify-items-center gap-5 rounded-card border-2 border-dashed px-5 py-10 text-center transition-colors sm:px-8 sm:py-14",
        drop.over ? "border-ink bg-mist" : "border-line-strong bg-white",
      )}
    >
      <span className="grid size-16 place-items-center rounded-full bg-coral-50 text-coral-700">
        <IconStore className="size-8" />
      </span>
      <div>
        <p className="text-lg font-bold">Envie a foto da frente da sua loja</p>
        <p className="mt-1 text-sm text-muted">
          JPG, PNG ou WEBP · até {MAX_FILE_MB} MB cada · até {MAX_PHOTOS} fotos · ou arraste para cá
        </p>
      </div>
      <div className="flex w-full flex-wrap justify-center gap-2">
        <Button variant="dark" size="md" className="grow sm:grow-0" loading={busy} icon={<IconUpload className="size-5" />} onClick={() => input.current?.click()}>
          {busy ? "Abrindo…" : "Escolher fotos"}
        </Button>
        <Button variant="outline" size="md" className="grow sm:grow-0" disabled={busy} onClick={onDemo}>
          Usar foto de exemplo
        </Button>
      </div>
      <ul className="grid max-w-md gap-1.5 text-left text-caption text-muted">
        <li>• De frente ou um pouco de lado, com a fachada inteira na foto.</li>
        <li>• De dia, sem carro ou pessoas na frente da fachada.</li>
        <li>• Depois, arraste os quatro cantos até as bordas da fachada.</li>
      </ul>
      <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple className="sr-only" tabIndex={-1} onChange={(event) => onFiles(takeFiles(event.currentTarget))} />
    </div>
  );
}

/** Miniaturas das fotos enviadas: escolher a ativa, remover e enviar mais. */
export function PhotoTray({
  photos,
  activeId,
  onSelect,
  onRemove,
  onFiles,
  busy,
}: {
  photos: Photo[];
  activeId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onFiles: (files: File[]) => void;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const drop = useDrop(onFiles);
  const full = photos.length >= MAX_PHOTOS;

  return (
    <div {...drop.props} className={cx("mt-4 rounded-card transition-colors", drop.over && "bg-mist")}>
      <p id="fachada-fotos" className="text-sm font-bold">
        Fotos da loja{" "}
        <span className="font-normal text-muted">
          ({photos.length} de {MAX_PHOTOS}) · cada foto guarda a sua marcação
        </span>
      </p>
      <ul aria-labelledby="fachada-fotos" className="no-scrollbar flex gap-3 overflow-x-auto pb-1 pr-2 pt-3">
        {photos.map((photo, i) => {
          const selected = photo.id === activeId;
          return (
            <li key={photo.id} className="relative shrink-0">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`Foto ${i + 1}: ${photo.name}`}
                onClick={() => onSelect(photo.id)}
                className={cx("block size-20 overflow-hidden rounded-thumb bg-mist ring-offset-2 transition-shadow", selected ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-ink/50")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- URL blob local, fora do otimizador */}
                <img src={photo.url} alt="" className="size-full object-cover" />
              </button>
              <IconButton
                label={`Remover a foto ${photo.name}`}
                size="sm"
                onClick={() => onRemove(photo.id)}
                className="absolute -right-2 -top-2 after:absolute after:-inset-1 after:rounded-full"
              >
                <IconClose className="size-4" />
              </IconButton>
            </li>
          );
        })}
        {!full && (
          <li className="shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="grid size-20 place-items-center rounded-thumb border-2 border-dashed border-line-strong text-caption font-semibold text-muted transition-colors hover:border-ink hover:text-ink"
            >
              <span className="grid justify-items-center gap-1">
                <IconPlus className="size-5" />
                {busy ? "Abrindo…" : "Mais fotos"}
              </span>
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple className="sr-only" tabIndex={-1} onChange={(event) => onFiles(takeFiles(event.currentTarget))} />
    </div>
  );
}
