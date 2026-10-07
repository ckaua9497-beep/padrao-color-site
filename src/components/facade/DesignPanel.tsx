"use client";

import { useId, useRef, useState } from "react";
import { IconUpload } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { cx } from "@/components/ui/cx";
import {
  DPI_MIN,
  DPI_RECOMMENDED,
  MAX_FILE_MB,
  facadeLabel,
  formatBytes,
  formatPixels,
  ratioLabel,
  requiredPixels,
  type AspectCheck,
  type FitMode,
  type ResolutionLevel,
} from "@/lib/facade";
import type { LoadedImage } from "./canvas";
import { IconFile } from "./icons";
import { Notice } from "./parts";

export type Design = LoadedImage & { id: string; name: string; type: string; bytes: number };

const DESIGN_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,application/pdf,.pdf,.ai,.cdr,.eps,.svg";

/** Escala do medidor de resolução (DPI). */
const METER_MAX = 150;

const LEVELS: Record<ResolutionLevel, { label: string; tone: "dark" | "new" | "brand"; bar: string }> = {
  otima: { label: "Ótima", tone: "dark", bar: "bg-lime" },
  boa: { label: "Boa para fachada", tone: "new", bar: "bg-sun" },
  baixa: { label: "Abaixo do mínimo", tone: "brand", bar: "bg-coral-700" },
};

function formatType(design: Design): string {
  const ext = design.name.split(".").pop()?.toUpperCase();
  return ext && ext.length <= 4 ? ext : design.type.replace("image/", "").toUpperCase();
}

type Props = {
  design: Design | null;
  productionFile: string | null;
  busy: boolean;
  error: string | null;
  onFile: (file: File | undefined) => void;
  onRemove: () => void;
  onRemoveProduction: () => void;
  /** Medida da fachada em cm (null enquanto não foi informada). */
  size: { w: number; h: number } | null;
  dpi: number | null;
  level: ResolutionLevel | null;
  aspect: AspectCheck | null;
  fit: FitMode;
  onFit: (fit: FitMode) => void;
  background: string;
  onBackground: (color: string) => void;
  artLater: boolean;
  onArtLater: (value: boolean) => void;
};

/** Passo do design: envio, formatos aceitos, resolução na medida final e encaixe na proporção da fachada. */
export function DesignPanel(props: Props) {
  const { design, productionFile, busy, error, onFile, size, dpi, level, aspect, fit, artLater } = props;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const colorId = useId();
  const choose = () => input.current?.click();

  return (
    <div className="grid gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          onFile(event.dataTransfer.files?.[0]);
        }}
        className={cx("rounded-card p-4 ring-1 transition-colors", over ? "bg-mist ring-ink" : "bg-white ring-line")}
      >
        {design ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="relative size-16 shrink-0 overflow-hidden rounded-thumb bg-mist ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL blob local, fora do otimizador */}
              <img src={design.url} alt="" className="size-full object-contain" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{design.name}</p>
              <p className="text-caption text-muted">
                {formatPixels(design.naturalWidth, design.naturalHeight)} · {formatType(design)} · {formatBytes(design.bytes)}
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="link" size="sm" className="min-h-11 px-2" onClick={choose} disabled={busy}>
                Trocar
              </Button>
              <Button variant="link" size="sm" className="min-h-11 px-2" onClick={props.onRemove}>
                Remover <span className="sr-only">{design.name}</span>
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={choose}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-control border-2 border-dashed border-line-strong px-4 py-6 text-center transition-colors hover:border-ink"
          >
            <span className="grid size-12 place-items-center rounded-full bg-coral-50 text-coral-700">
              <IconUpload className="size-6" />
            </span>
            <span className="text-[15px] font-bold">{busy ? "Abrindo o design…" : "Enviar o design da fachada"}</span>
            <span className="text-caption text-muted">PNG, JPG ou WEBP aparecem na simulação · PDF, AI, CDR, EPS e SVG seguem depois do pedido · ou arraste aqui</span>
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept={DESIGN_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            onFile(file);
          }}
        />
      </div>

      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}

      {productionFile && (
        <Notice tone="info">
          <p className="flex items-center gap-2 font-semibold">
            <IconFile aria-hidden className="size-4 shrink-0" /> {productionFile}
          </p>
          <p className="mt-1">
            PDF, AI, CDR, EPS e SVG não abrem no simulador. Guarde este arquivo: depois do pedido, ele vai pelo WhatsApp ou pelo reenvio de arte. Para ver a simulação agora, envie
            também uma imagem PNG, JPG ou WEBP.
          </p>
          <Button variant="link" size="sm" className="mt-1 min-h-11 text-sm" onClick={props.onRemoveProduction}>
            Tirar este arquivo
          </Button>
        </Notice>
      )}

      {design && !size && <Notice tone="info">Informe a medida da fachada (passo 2) para conferirmos a resolução e a proporção do design.</Notice>}

      {design && size && dpi !== null && level && (
        <ResolutionReport design={design} size={size} dpi={dpi} level={level} artLater={artLater} />
      )}

      {design && size && aspect && (
        <div className="grid gap-3">
          {aspect.matches ? (
            <Notice tone="ok">A proporção do design ({ratioLabel(aspect.design)}) bate com a da fachada.</Notice>
          ) : (
            <>
              <Notice tone="warn">
                O design é {ratioLabel(aspect.design)} e a fachada, {ratioLabel(aspect.facade)}: {Math.round(aspect.diff * 100)}% de diferença. Escolha como encaixar:
              </Notice>
              <OptionGroup
                label="Encaixe do design na fachada"
                value={fit}
                onChange={(value) => props.onFit(value as FitMode)}
                className="grid gap-2 sm:grid-cols-2"
                options={[
                  {
                    value: "cover",
                    label: (
                      <span className="grid gap-0.5">
                        <span className="font-bold">Preencher</span>
                        <span className="text-caption font-normal text-muted">
                          Ocupa a fachada toda e corta {Math.round(aspect.diff * 100)}% {aspect.cropSide === "laterais" ? "nas laterais" : "no topo e na base"}.
                        </span>
                      </span>
                    ),
                  },
                  {
                    value: "contain",
                    label: (
                      <span className="grid gap-0.5">
                        <span className="font-bold">Ajustar</span>
                        <span className="text-caption font-normal text-muted">Mostra o design inteiro e completa a sobra com a cor de fundo.</span>
                      </span>
                    ),
                  },
                ]}
              />
              {fit === "contain" && (
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor={colorId} className="text-sm font-semibold">
                    Cor de fundo
                  </label>
                  <input
                    id={colorId}
                    type="color"
                    value={props.background}
                    onChange={(event) => props.onBackground(event.target.value)}
                    className="h-11 w-16 cursor-pointer rounded-control border border-line-strong bg-white p-1"
                  />
                  <span className="text-caption text-muted">Também aparece nas partes transparentes do PNG.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <label className="flex min-h-11 items-start gap-3 text-sm leading-snug">
        <input type="checkbox" checked={artLater} onChange={(event) => props.onArtLater(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-coral-700" />
        <span>
          <span className="font-semibold">Vou enviar a arte final depois</span>
          <span className="block text-caption text-muted">PDF, AI, CDR ou imagem maior, pelo WhatsApp ou pelo reenvio de arte do pedido. A simulação continua valendo como referência.</span>
        </span>
      </label>
      <p className="text-caption text-muted">
        Imagens até {MAX_FILE_MB} MB. Veja as regras completas em{" "}
        <a href="#arquivos-aceitos" className="font-semibold text-ink underline underline-offset-2">
          arquivos aceitos
        </a>
        .
      </p>
    </div>
  );
}

function ResolutionReport({ design, size, dpi, level, artLater }: { design: Design; size: { w: number; h: number }; dpi: number; level: ResolutionLevel; artLater: boolean }) {
  const info = LEVELS[level];
  const widthM = size.w / 100;
  const heightM = size.h / 100;
  const minimum = requiredPixels(widthM, heightM, DPI_MIN);
  const recommended = requiredPixels(widthM, heightM, DPI_RECOMMENDED);
  const rounded = Math.round(dpi);

  return (
    <div className="grid gap-3 rounded-card bg-white p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">
          Resolução na fachada: <span className="tabular-nums">{rounded} DPI</span>
        </p>
        <Badge tone={info.tone}>{info.label}</Badge>
      </div>
      <div
        role="meter"
        aria-label="Resolução do design na medida final"
        aria-valuemin={0}
        aria-valuemax={METER_MAX}
        aria-valuenow={Math.min(rounded, METER_MAX)}
        aria-valuetext={`${rounded} DPI: ${info.label.toLowerCase()}`}
        className="relative h-2.5 overflow-hidden rounded-full bg-fog"
      >
        <span className={cx("absolute inset-y-0 left-0 rounded-full", info.bar)} style={{ width: `${Math.min(100, (dpi / METER_MAX) * 100)}%` }} />
        {[DPI_MIN, DPI_RECOMMENDED].map((mark) => (
          <span key={mark} aria-hidden className="absolute inset-y-0 w-0.5 bg-ink/40" style={{ left: `${(mark / METER_MAX) * 100}%` }} />
        ))}
      </div>
      <div aria-hidden className="relative h-4 text-[11px] text-muted">
        <span className="absolute -translate-x-1/2" style={{ left: `${(DPI_MIN / METER_MAX) * 100}%` }}>
          mín. {DPI_MIN}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${(DPI_RECOMMENDED / METER_MAX) * 100}%` }}>
          ideal {DPI_RECOMMENDED}
        </span>
      </div>
      <p className="text-caption text-muted">
        Para {facadeLabel(size.w, size.h)}: mínimo {formatPixels(minimum.w, minimum.h)} ({DPI_MIN} DPI); recomendado {formatPixels(recommended.w, recommended.h)} ({DPI_RECOMMENDED} DPI).
        O design tem {formatPixels(design.naturalWidth, design.naturalHeight)}.
      </p>
      {level === "baixa" && (
        <Notice tone={artLater ? "warn" : "error"} role={artLater ? undefined : "alert"}>
          Abaixo de {DPI_MIN} DPI a fachada sai pixelada. Envie um arquivo maior ou em vetor (PDF, AI, CDR){artLater ? ": a arte final vai depois do pedido." : ", ou marque “Vou enviar a arte final depois”."}
        </Notice>
      )}
    </div>
  );
}
