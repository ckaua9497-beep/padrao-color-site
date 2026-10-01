"use client";

import { useRef, useState } from "react";
import { IconUpload } from "@/components/icons";
import { ART_FONTS, SAMPLE_TEXT, TEXT_COLORS, TEXT_LIMIT, type ArtFamily, type ArtSettings } from "@/components/mockup/art";
import { ART_FONT_KEYS, type ArtFont } from "@/components/mockup/fonts";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";

type Props = {
  step: number;
  family: ArtFamily;
  /** Produto vendido sem impressão: a arte serve só para simular, não é exigida. */
  blank?: boolean;
  art: ArtSettings;
  onArt: (update: (art: ArtSettings) => ArtSettings) => void;
  artName: string | null;
  onFile: (file: File | undefined) => void;
  uploadError: string | null;
  uploading: boolean;
  artLater: boolean;
  onArtLater: (value: boolean) => void;
  missing: boolean;
};

/** Passo "Sua arte": texto (aparece no mockup na hora) ou imagem enviada, ou enviar depois. */
export function ArtStep({ step, family, blank = false, art, onArt, artName, onFile, uploadError, uploading, artLater, onArtLater, missing }: Props) {
  const [mode, setMode] = useState<"texto" | "imagem">(art.src ? "imagem" : "texto");
  const fileInput = useRef<HTMLInputElement>(null);
  const neon = family === "neon";

  return (
    <li id="passo-arte" className="scroll-mt-32">
      <p className="mb-3 flex items-center gap-2 text-[15px] font-bold">
        <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">{step}</span>
        {blank ? "Simule a sua arte" : "Sua arte"}
        <span className="text-caption font-normal text-muted">{blank ? "· o produto é vendido sem impressão" : "· aparece no mockup 3D"}</span>
      </p>

      <SegmentedControl
        label="Como montar a arte"
        value={mode}
        onChange={setMode}
        options={[
          { value: "texto", label: "Escrever texto" },
          { value: "imagem", label: "Enviar imagem" },
        ]}
      />

      <div className={cx("mt-4 rounded-card p-4 ring-1 transition-colors", missing ? "bg-coral-50 ring-coral-700" : "bg-white ring-line")}>
        {mode === "texto" ? (
          <div className="grid gap-4">
            <TextField
              label="Texto da arte"
              value={art.text}
              onChange={(text) => onArt((a) => ({ ...a, text }))}
              maxLength={TEXT_LIMIT[family]}
              placeholder={SAMPLE_TEXT[family]}
              hint={art.src ? "Aparece por cima da imagem, na parte de baixo." : "Aparece no mockup na hora. Você também pode enviar uma imagem."}
              autoComplete="off"
            />
            <div>
              <p className="mb-2 text-[15px] font-bold">Fonte</p>
              <OptionGroup
                label="Fonte do texto"
                value={art.font}
                onChange={(font) => onArt((a) => ({ ...a, font: font as ArtFont }))}
                options={ART_FONT_KEYS.map((key) => ({
                  value: key,
                  label: (
                    <span className="flex items-baseline gap-2">
                      <span className="text-lg leading-none" style={{ fontFamily: ART_FONTS[key].family ?? "var(--font-figtree)", fontWeight: ART_FONTS[key].weight }}>
                        Aa
                      </span>
                      {ART_FONTS[key].label}
                    </span>
                  ),
                }))}
              />
            </div>
            {!neon && (
              <div>
                <p className="mb-2 text-[15px] font-bold">
                  Cor do texto <span className="font-normal text-muted">· {TEXT_COLORS.find((c) => c.value === art.textColor)?.label ?? "Personalizada"}</span>
                </p>
                <OptionGroup
                  label="Cor do texto"
                  variant="swatch"
                  value={art.textColor}
                  onChange={(textColor) => onArt((a) => ({ ...a, textColor }))}
                  options={TEXT_COLORS.map((c) => ({ value: c.value, label: c.label, color: c.value }))}
                />
              </div>
            )}
            {neon && <p className="text-caption text-muted">No neon, a cor vem da opção de LED escolhida acima.</p>}
          </div>
        ) : (
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onFile(event.dataTransfer.files?.[0]);
            }}
          >
            {artName ? (
              <div className="flex flex-wrap items-center gap-4">
                <span className="relative size-16 shrink-0 overflow-hidden rounded-thumb bg-mist">
                  {art.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={art.src} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-[11px] font-bold text-muted">PDF</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{artName}</p>
                  <p className="text-caption text-muted">{art.src ? "Aplicada no mockup 3D" : "Arquivo anexado ao pedido; a prévia 3D usa a arte de exemplo"}</p>
                </div>
                <Button variant="link" size="sm" onClick={() => fileInput.current?.click()}>
                  Trocar
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-control border-2 border-dashed border-line-strong py-6 text-center transition-colors hover:border-ink"
              >
                <span className="grid size-12 place-items-center rounded-full bg-coral-50 text-coral-700">
                  <IconUpload className="size-6" />
                </span>
                <span className="text-[15px] font-bold">{uploading ? "Lendo a imagem…" : "Enviar arte"}</span>
                <span className="text-caption text-muted">PNG, JPG ou WEBP aparecem em 3D · PDF também é aceito · ou arraste aqui</span>
              </button>
            )}
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" tabIndex={-1} onChange={(event) => onFile(event.target.files?.[0])} />
            {uploadError && (
              <p role="alert" className="mt-3 text-sm font-semibold text-coral-700">
                {uploadError}
              </p>
            )}

            {art.src && (
              <div className="mt-4 grid gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    label="Encaixe da imagem"
                    value={art.fit}
                    onChange={(fit) => onArt((a) => ({ ...a, fit, zoom: 1, offsetX: 0, offsetY: 0 }))}
                    options={[
                      { value: "cover", label: "Preencher" },
                      { value: "contain", label: "Ajustar" },
                    ]}
                  />
                  <Button variant="outline" size="sm" onClick={() => onArt((a) => ({ ...a, rotation: ((a.rotation + 90) % 360) as ArtSettings["rotation"] }))}>
                    Girar 90°
                  </Button>
                  <label className="flex h-11 items-center gap-2 rounded-full border border-line-strong pl-4 pr-1.5 text-[15px] font-bold">
                    Fundo
                    <input type="color" value={art.background} onChange={(event) => onArt((a) => ({ ...a, background: event.target.value }))} className="size-8 rounded-full border-0 bg-transparent" />
                  </label>
                </div>
                <Slider label="Zoom" value={art.zoom} min={1} max={2.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(zoom) => onArt((a) => ({ ...a, zoom }))} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Slider label="Horizontal" value={art.offsetX} min={-0.5} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}`} onChange={(offsetX) => onArt((a) => ({ ...a, offsetX }))} />
                  <Slider label="Vertical" value={art.offsetY} min={-0.5} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}`} onChange={(offsetY) => onArt((a) => ({ ...a, offsetY }))} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {blank ? (
        <p className="mt-3 text-caption text-muted">A arte não vai impressa: ela mostra como o produto fica depois que você personalizar.</p>
      ) : (
        <label className="mt-3 flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={artLater} onChange={(event) => onArtLater(event.target.checked)} className="size-4 accent-coral-700" />
          Enviar arte depois (a equipe entra em contato)
        </label>
      )}
      {missing && (
        <p role="alert" className="mt-2 text-sm font-semibold text-coral-700">
          Escreva um texto, envie a arte ou marque “Enviar arte depois” para continuar.
        </p>
      )}
    </li>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span className="flex justify-between">
        {label}
        <span className="font-normal tabular-nums text-muted">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-ink" />
    </label>
  );
}
