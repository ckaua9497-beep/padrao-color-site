"use client";

import { useRef, useState } from "react";
import { ART_STYLES, type ArtSettings } from "@/components/mockup/art";
import { IconGrid, IconUpload } from "@/components/icons";
import { PalettePicker } from "@/components/party/PalettePicker";
import { StylePicker } from "@/components/product/ArtStep";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import { ART_ACCEPT } from "@/lib/image-prep";
import { KIT_PALETTES, type KitDetails } from "@/lib/kit-builder";
import { getPalette } from "@/lib/party";
import type { KitLogo, KitLook } from "./kit-art";
import { UploadError, readKitLogo } from "./kit-upload";

type Props = {
  details: KitDetails;
  onDetails: (patch: Partial<KitDetails>) => void;
  /** Dias úteis até a data escolhida (dica do campo). */
  daysUntil: number | null;
  look: KitLook;
  onLook: (patch: Partial<KitLook>) => void;
  logo: KitLogo | null;
  onLogo: (logo: KitLogo | null) => void;
  /** A arte comum do kit (prévias dos estilos). */
  art: ArtSettings;
  later: boolean;
  onLater: (value: boolean) => void;
  /** Tentou adicionar ao carrinho sem arte nenhuma. */
  missing: boolean;
  /** Itens que recebem a arte do kit. */
  count: number;
  onGallery: () => void;
};

/**
 * "Personalize todos os itens de uma vez": o logo (enviado uma vez), o nome e a frase, o estilo do nome, as cores
 * da marca e o fundo atrás do logo. Cada item recebe essa arte encaixada na área dele; o ajuste fino de um item
 * fica no editor do próprio item.
 */
export function KitArtPanel({ details, onDetails, daysUntil, look, onLook, logo, onLogo, art, later, onLater, missing, count, onGallery }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cada envio ganha um número: um envio anterior que termina depois não troca o logo mais novo.
  const seq = useRef(0);
  const palette = getPalette(details.palette);
  const withLogo = Boolean(logo?.src);
  const showText = !withLogo || look.showName;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const mine = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const next = await readKitLogo(file);
      if (mine !== seq.current) return;
      onLogo(next);
    } catch (problem) {
      if (mine !== seq.current) return;
      setError(problem instanceof UploadError ? problem.message : "Não conseguimos ler esse arquivo. Tente PNG, JPG, WEBP, SVG ou PDF.");
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  };

  return (
    <div className={cx("@container grid gap-7 rounded-card p-5 ring-1 transition-colors sm:p-6", missing ? "bg-coral-50 ring-coral-700" : "bg-white shadow-card ring-line")}>
      <div className="grid gap-6 @2xl:grid-cols-2">
        <div>
          <p className="mb-2 text-[15px] font-bold">
            Logo <span className="font-normal text-muted">· se tiver</span>
          </p>
          <LogoDrop logo={logo} busy={busy} error={error} count={count} onFile={onFile} onRemove={() => onLogo(null)} />
        </div>
        <div className="grid content-start gap-4">
          <TextField label="Nome da empresa ou da marca" value={details.brand} onChange={(brand) => onDetails({ brand })} maxLength={60} autoComplete="organization" placeholder="Ex.: Café Aurora" />
          <TextField label="Frase (opcional)" value={details.phrase} onChange={(phrase) => onDetails({ phrase })} maxLength={80} placeholder="Ex.: Bem-vindo ao time!" />
          {withLogo && (
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={look.showName} onChange={(event) => onLook({ showName: event.target.checked })} className="size-4 accent-coral-700" />
              Mostrar o nome e a frase junto do logo
            </label>
          )}
        </div>
      </div>

      {showText && (
        <div>
          <p className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] font-bold">
            Estilo do nome
            <span className="text-caption font-normal text-muted">{withLogo ? "o nome entra por cima do logo" : "o nome vira a arte de cada item"}</span>
          </p>
          <StylePicker
            art={art}
            family="card"
            kind="card"
            aspect={1.75}
            label={details.brand || "Sua marca"}
            fontFor={(style) => ART_STYLES.find((option) => option.value === style)?.font ?? art.font}
            onPick={(style) => onLook({ style })}
          />
        </div>
      )}

      <div>
        <p className="mb-2 text-[15px] font-bold">
          Cores da marca <span className="font-normal text-muted">· {palette.label}</span>
        </p>
        <PalettePicker palettes={KIT_PALETTES} value={details.palette} onChange={(id) => onDetails({ palette: id })} label="Cores da marca" />
        {withLogo && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm font-semibold">Fundo atrás do logo</span>
            <SegmentedControl
              label="Fundo atrás do logo"
              value={look.background}
              onChange={(background) => onLook({ background })}
              options={[
                { value: "branco", label: "Branco" },
                { value: "marca", label: "Cor da marca" },
              ]}
            />
            <span className="text-caption text-muted">Nas camisetas o fundo não é impresso.</span>
          </div>
        )}
      </div>

      <div className="grid gap-5 border-t border-line pt-6 @xl:grid-cols-2 @xl:items-end">
        <TextField
          type="date"
          label="Para quando você precisa (opcional)"
          value={details.date}
          onChange={(date) => onDetails({ date })}
          hint={daysUntil === null ? "Ajuda a conferir o prazo de produção." : `Faltam ${daysUntil} ${daysUntil === 1 ? "dia útil" : "dias úteis"}.`}
        />
        <Button variant="outline" size="sm" icon={<IconGrid className="size-4" />} onClick={onGallery} className="@xl:justify-self-end">
          Ver o kit inteiro com a arte
        </Button>
      </div>

      <div>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={later} onChange={(event) => onLater(event.target.checked)} className="size-4 accent-coral-700" />
          Prefiro mandar as artes depois (a equipe entra em contato)
        </label>
        {missing && (
          <p role="alert" className="mt-2 text-sm font-semibold text-coral-700">
            Envie o logo, escreva o nome da marca ou marque “mandar as artes depois” para continuar.
          </p>
        )}
      </div>
    </div>
  );
}

type LogoDropProps = {
  logo: KitLogo | null;
  busy: boolean;
  error: string | null;
  count: number;
  onFile: (file: File | undefined) => void;
  onRemove: () => void;
};

/** Envio do logo (clique ou arraste), com a miniatura, o que o tratador fez, trocar e remover. */
function LogoDrop({ logo, busy, error, count, onFile, onRemove }: LogoDropProps) {
  const input = useRef<HTMLInputElement>(null);
  const extension = logo?.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "";
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onFile(event.dataTransfer.files?.[0]);
      }}
    >
      {logo ? (
        <div className="flex items-start gap-3 rounded-control bg-mist p-3">
          <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-thumb bg-white ring-1 ring-line">
            {logo.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo.src} alt="" className="size-full object-contain p-1" />
            ) : (
              <span className="text-[11px] font-bold text-muted">{extension}</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{logo.name}</p>
            <p className="text-caption text-muted" aria-live="polite">
              {busy ? "Lendo o logo novo…" : logo.src ? `Aplicado ${count === 1 ? "no item" : `nos ${count} itens`} do kit, no tamanho de cada um.` : "Vai anexado ao pedido; a prévia usa o nome da marca."}
            </p>
            {logo.note && !busy && <p className="text-caption text-muted">{logo.note}</p>}
            <div className="mt-1.5 flex gap-4">
              <Button variant="link" size="sm" className="min-h-8" disabled={busy} onClick={() => input.current?.click()}>
                Trocar o logo
              </Button>
              <Button variant="link" size="sm" className="min-h-8" disabled={busy} onClick={onRemove}>
                Remover
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex w-full flex-col items-center gap-2 rounded-control border-2 border-dashed border-line-strong px-4 py-7 text-center transition-colors hover:border-ink disabled:opacity-70"
        >
          <span className="grid size-12 place-items-center rounded-full bg-coral-50 text-coral-700">
            <IconUpload className="size-6" />
          </span>
          <span className="text-[15px] font-bold" aria-live="polite">
            {busy ? "Lendo o logo…" : "Enviar o logo"}
          </span>
          <span className="text-caption text-muted">PNG, JPG, WEBP, SVG ou PDF · ou arraste aqui</span>
          <span className="text-caption text-muted">Entra em todos os itens, no tamanho certo de cada um.</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ART_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-coral-700">
          {error}
        </p>
      )}
    </div>
  );
}
