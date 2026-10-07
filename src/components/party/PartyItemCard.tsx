"use client";

import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import { IconCube } from "@/components/icons";
import QtyStepper from "@/components/ui/QtyStepper";
import { cx } from "@/components/ui/cx";
import { formatBRL, imageUrl } from "@/lib/format";
import { amountLabel, choiceValues, sizeLimits, type PartyItem, type PricedItem, type SizeLimits } from "@/lib/party";
import type { ItemState } from "./item-state";

type Props = {
  item: PartyItem;
  priced: PricedItem;
  state: ItemState;
  onChange: (patch: Partial<ItemState>) => void;
  onPreview: () => void;
  previewing: boolean;
  /** Montagem livre: o item entra e sai da festa. No kit a composição é fixa (undefined). */
  included?: boolean;
  onToggle?: () => void;
  /** h4 quando a lista vem agrupada por papel (com um h3 por grupo). */
  headingLevel?: "h3" | "h4";
};

/** Item da festa ou do kit: foto, preço calculado e, quando entra na festa, quantidade, opção e medida. */
export function PartyItemCard({ item, priced, state, onChange, onPreview, previewing, included, onToggle, headingLevel = "h3" }: Props) {
  const free = included !== undefined;
  const showControls = !free || included;
  const Heading = headingLevel;

  return (
    <li className={cx("rounded-card bg-white p-4 shadow-card ring-inset transition-shadow duration-200 sm:p-5", free && included ? "ring-2 ring-ink" : "ring-1 ring-line")}>
      <div className="flex gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-control bg-mist">
          <Image src={imageUrl(item.product.image)} alt="" fill sizes="80px" className="object-contain p-1.5" />
        </div>
        <div className="min-w-0 flex-1">
          <Heading className="text-[15px] font-bold leading-snug">{item.title}</Heading>
          <p className="mt-0.5 text-caption text-muted">{item.hint}</p>
          <p className="mt-1.5 text-sm tabular-nums" aria-live={showControls ? "polite" : undefined}>
            {priced.open && <span className="text-caption text-muted">a partir de </span>}
            <span className="font-bold">{formatBRL(priced.total)}</span>
            <span className="text-caption text-muted"> · {amountLabel(item, priced)}</span>
          </p>
        </div>
      </div>

      {showControls && <ItemControls item={item} priced={priced} state={state} onChange={onChange} />}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {free && (
          <label
            className={cx(
              "inline-flex h-11 items-center gap-2.5 rounded-full px-5 text-[15px] font-bold transition-colors duration-200",
              included ? "bg-ink text-white" : "border border-line-strong bg-white text-ink hover:border-ink",
            )}
          >
            <input type="checkbox" checked={included} onChange={onToggle} className="size-4 accent-coral-700" />
            Incluir na festa
          </label>
        )}
        <button
          type="button"
          aria-pressed={previewing}
          onClick={onPreview}
          className={cx("inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline", previewing ? "text-ink" : "text-preview")}
        >
          <IconCube className="size-4" /> Ver na prévia
        </button>
        <Link href={`/produto/${item.product.slug}`} target="_blank" className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Detalhes do produto<span className="sr-only"> {item.product.name} (abre em nova aba)</span>
        </Link>
      </div>
    </li>
  );
}

function qtyLabel(item: PartyItem, priced: PricedItem): string {
  if (item.parts) return "Conjuntos";
  if (priced.size) return "Peças";
  if ((priced.lines[0]?.setQty ?? 1) > 1) return "Pacotes";
  return "Quantidade";
}

function choiceLabel(choice: string): string {
  return /^(quantidade|kit com)$/i.test(choice) ? "Unidades por pacote" : choice;
}

function qtyHint(priced: PricedItem): string | null {
  const { min, max } = priced.limits;
  if (min > 1 && max < 99) return `De ${min} a ${max} por item.`;
  if (min > 1) return `Pedido mínimo de ${min}.`;
  if (max < 99) return `Até ${max} por item.`;
  return null;
}

/** Quantidade, opção trocada na montagem, medida (m²) e grade de tamanhos. */
export function ItemControls({ item, priced, state, onChange }: { item: PartyItem; priced: PricedItem; state: ItemState; onChange: (patch: Partial<ItemState>) => void }) {
  const id = useId();
  const choice = item.choice ? choiceValues(item.product, item.choice, item.preset) : null;
  const current = choice ? priced.lines[0]?.selection[choice.key] : undefined;
  const limits = item.product.customSize ? sizeLimits(item.product.customSize) : null;
  const hint = qtyHint(priced);

  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <p className="mb-1.5 text-caption font-semibold">{qtyLabel(item, priced)}</p>
          <QtyStepper size="sm" value={priced.qty} min={priced.limits.min} max={priced.limits.max} onChange={(qty) => onChange({ qty })} label={`${qtyLabel(item, priced)} de ${item.title}`} />
        </div>
        {choice && item.choice && (
          <div className="min-w-[10rem] flex-1">
            <label htmlFor={`${id}-opcao`} className="mb-1.5 block text-caption font-semibold">
              {choiceLabel(item.choice)}
            </label>
            <select
              id={`${id}-opcao`}
              value={current ?? choice.values[0]}
              onChange={(event) => onChange({ choice: event.target.value })}
              className="h-9 w-full rounded-control border border-line-strong bg-white px-3 text-sm focus:border-ink"
            >
              {choice.values.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {hint && <p className="-mt-2 text-caption text-muted">{hint}</p>}

      {limits && <SizeFields id={id} item={item} priced={priced} state={state} limits={limits} onChange={onChange} />}

      {item.askSizes && (
        <div>
          <label htmlFor={`${id}-tamanhos`} className="mb-1.5 block text-caption font-semibold">
            Tamanhos (opcional)
          </label>
          <input
            id={`${id}-tamanhos`}
            value={state.sizes}
            maxLength={80}
            onChange={(event) => onChange({ sizes: event.target.value })}
            placeholder="Ex.: 2 M, 1 G e 1 de 8 anos"
            aria-describedby={`${id}-tamanhos-dica`}
            autoComplete="off"
            className="h-11 w-full rounded-control border border-line-strong bg-white px-3 text-sm placeholder:text-muted focus:border-ink"
          />
          {item.product.sizes?.length ? (
            <p id={`${id}-tamanhos-dica`} className="mt-1.5 text-caption text-muted">
              Grade: {item.product.sizes.join(", ")}.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

const fmtSide = (cm: number) => (cm >= 100 ? `${(cm / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m` : `${cm} cm`);

function limitsText(limits: SizeLimits): string {
  const parts = [`Largura de ${fmtSide(limits.minWidthCm)} a ${fmtSide(limits.maxWidthCm)}`, `altura de ${fmtSide(limits.minHeightCm)} a ${fmtSide(limits.maxHeightCm)}`];
  if (limits.minArea) parts.push(`cobrança mínima de ${limits.minArea.toLocaleString("pt-BR")} m²`);
  if (limits.maxArea) parts.push(`área máxima de ${limits.maxArea.toLocaleString("pt-BR")} m²`);
  return `${parts.join(" · ")}.`;
}

/** Largura × altura em cm, com os limites do produto e o cálculo por m². */
function SizeFields({ id, item, priced, state, limits, onChange }: { id: string; item: PartyItem; priced: PricedItem; state: ItemState; limits: SizeLimits; onChange: (patch: Partial<ItemState>) => void }) {
  const line = priced.lines[0];
  const area = line?.area;
  const field = "h-11 w-full rounded-control border bg-white px-3 text-sm tabular-nums focus:border-ink";
  const invalid = Boolean(priced.error);

  return (
    <fieldset aria-describedby={`${id}-limites`}>
      <legend className="mb-1.5 text-caption font-semibold">Medida de {item.title.toLowerCase()}</legend>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:max-w-sm">
        <div>
          <label htmlFor={`${id}-largura`} className="mb-1 block text-caption text-muted">
            Largura (cm)
          </label>
          <input
            id={`${id}-largura`}
            inputMode="decimal"
            autoComplete="off"
            value={state.width}
            onChange={(event) => onChange({ width: event.target.value.replace(/[^\d,.]/g, "").slice(0, 7) })}
            aria-invalid={invalid || undefined}
            className={cx(field, invalid ? "border-coral-700" : "border-line-strong")}
          />
        </div>
        <span aria-hidden className="pb-3 text-muted">
          ×
        </span>
        <div>
          <label htmlFor={`${id}-altura`} className="mb-1 block text-caption text-muted">
            Altura (cm)
          </label>
          <input
            id={`${id}-altura`}
            inputMode="decimal"
            autoComplete="off"
            value={state.height}
            onChange={(event) => onChange({ height: event.target.value.replace(/[^\d,.]/g, "").slice(0, 7) })}
            aria-invalid={invalid || undefined}
            className={cx(field, invalid ? "border-coral-700" : "border-line-strong")}
          />
        </div>
      </div>
      <p id={`${id}-limites`} className="mt-1.5 text-caption text-muted">
        {limitsText(limits)}
      </p>
      <p className={cx("mt-1 text-caption", priced.error ? "font-semibold text-coral-700" : "text-ink/80")} aria-live="polite">
        {priced.error ??
          (area && line?.pricePerM2
            ? `Área de ${area.area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m² × ${formatBRL(line.pricePerM2)} o m²${area.billedArea > area.area ? ` (cobrada a área mínima de ${area.billedArea.toLocaleString("pt-BR")} m²)` : ""}.`
            : null)}
      </p>
    </fieldset>
  );
}
