"use client";

import Link from "next/link";
import { useId } from "react";
import { IconBrush, IconCube } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import QtyStepper from "@/components/ui/QtyStepper";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import { KIT_CEILING, type KitItem, type KitLine, type KitPlan } from "@/lib/kit-builder";
import { choiceValues, sizeLimits } from "@/lib/party";
import { ArtThumb } from "./ArtThumb";
import type { ArtStatus, ItemView } from "./kit-art";
import { FotoProduto } from "@/components/FotoProduto";

type Props = {
  item: KitItem;
  plan: KitPlan;
  line: KitLine;
  kits: number;
  /** A arte do item (a do kit encaixada nele ou a própria) e a situação dela. */
  view: ItemView;
  status: ArtStatus;
  /** Foto 3D do item com a arte, quando já foi feita. */
  shot: string | null;
  onLine: (patch: Partial<KitLine>) => void;
  onRemove: () => void;
  onPreview: () => void;
  onEdit: () => void;
  previewing: boolean;
};

/** Como o item conta por kit: unidades, pacotes (cartões com o nome de cada pessoa) ou peças na medida. */
export function perKitUnit(item: Pick<KitItem, "perPerson" | "product">, count: number): string {
  if (item.perPerson) return count === 1 ? "pacote" : "pacotes";
  if (item.product.customSize) return count === 1 ? "peça" : "peças";
  return count === 1 ? "unidade" : "unidades";
}

const fmt = (value: number) => value.toLocaleString("pt-BR");

/**
 * Item do kit: foto (a do 3D com a arte, quando já existe), valor por kit e total dos kits, o que vai no pedido
 * (faixa de preço, pacotes, sobra), os ajustes — quantidade por kit, a opção que o item troca, medida (m²) e grade
 * de tamanhos — e a arte do item, com o botão que abre o editor dele.
 */
export function KitItemCard({ item, plan, line, kits, view, status, shot, onLine, onRemove, onPreview, onEdit, previewing }: Props) {
  const id = useId();
  const choice = item.choice ? choiceValues(plan.item.product, item.choice, item.preset) : null;
  const current = choice ? plan.priced.lines[0]?.selection[choice.key] : undefined;
  const limits = plan.item.product.customSize ? sizeLimits(plan.item.product.customSize) : null;
  const unit = perKitUnit(item, line.perKit);
  const missing = status.tone === "missing";

  return (
    <li
      id={`kit-item-${item.key}`}
      className={cx("scroll-mt-32 rounded-card bg-white p-4 shadow-card ring-inset transition-shadow duration-200 sm:p-5", plan.error ? "ring-2 ring-coral-700" : "ring-1 ring-line")}
    >
      <div className="flex gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-control bg-mist">
          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot} alt={`${item.title} com a arte`} className="size-full object-cover" />
          ) : (
            <FotoProduto src={plan.item.product.image} alt="" sizes="80px" respiro="p-1.5" estudio="cobrir" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h4 className="text-[15px] font-bold leading-snug">{item.title}</h4>
              <p className="mt-0.5 text-caption text-muted">{item.hint}</p>
            </div>
            <p className="shrink-0 text-right tabular-nums" aria-live="polite">
              <span className="block text-[17px] font-bold">{formatBRL(plan.perKit)}</span>
              <span className="block text-caption text-muted">por kit · {formatBRL(plan.priced.total)} no total</span>
            </p>
          </div>
          {plan.notes.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {plan.notes.map((note) => (
                <li key={note} className="rounded-full bg-mist px-2.5 py-0.5 text-caption font-semibold text-ink/80">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div>
            <p className="mb-1.5 text-caption font-semibold">{item.perPerson ? "Pacotes por kit" : "Por kit"}</p>
            <div className="flex items-center gap-2">
              <QtyStepper size="sm" value={line.perKit} min={1} max={KIT_CEILING} onChange={(perKit) => onLine({ perKit })} label={`${item.title} por kit`} />
              <span className="text-caption text-muted">{unit}</span>
            </div>
          </div>
          {choice && item.choice && (
            <div className="min-w-[10rem] flex-1">
              <label htmlFor={`${id}-opcao`} className="mb-1.5 block text-caption font-semibold">
                {/^(quantidade|kit com)$/i.test(item.choice) ? "Unidades por pacote" : item.choice}
              </label>
              <select
                id={`${id}-opcao`}
                value={current ?? choice.values[0]}
                onChange={(event) => onLine({ choice: event.target.value })}
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
        <p className="-mt-2 text-caption text-muted">
          {fmt(plan.needed)} {plan.needed === 1 ? "unidade" : "unidades"} para {fmt(kits)} {kits === 1 ? "kit" : "kits"}
          {plan.ordered !== plan.needed ? ` · ${fmt(plan.ordered)} no pedido` : ""}.
        </p>

        {limits && (
          <fieldset>
            <legend className="mb-1.5 text-caption font-semibold">Medida de cada peça</legend>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:max-w-sm">
              <div>
                <label htmlFor={`${id}-largura`} className="mb-1 block text-caption text-muted">
                  Largura (cm)
                </label>
                <input
                  id={`${id}-largura`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={line.width}
                  onChange={(event) => onLine({ width: event.target.value.replace(/[^\d,.]/g, "").slice(0, 7) })}
                  aria-invalid={Boolean(plan.error) || undefined}
                  className={cx("h-11 w-full rounded-control border bg-white px-3 text-sm tabular-nums focus:border-ink", plan.error ? "border-coral-700" : "border-line-strong")}
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
                  value={line.height}
                  onChange={(event) => onLine({ height: event.target.value.replace(/[^\d,.]/g, "").slice(0, 7) })}
                  aria-invalid={Boolean(plan.error) || undefined}
                  className={cx("h-11 w-full rounded-control border bg-white px-3 text-sm tabular-nums focus:border-ink", plan.error ? "border-coral-700" : "border-line-strong")}
                />
              </div>
            </div>
            <p className="mt-1.5 text-caption text-muted">
              Largura de {fmt(limits.minWidthCm)} a {fmt(limits.maxWidthCm)} cm e altura de {fmt(limits.minHeightCm)} a {fmt(limits.maxHeightCm)} cm.
            </p>
          </fieldset>
        )}

        {item.askSizes && (
          <div>
            <label htmlFor={`${id}-tamanhos`} className="mb-1.5 block text-caption font-semibold">
              Tamanhos (opcional)
            </label>
            <input
              id={`${id}-tamanhos`}
              value={line.sizes}
              maxLength={120}
              onChange={(event) => onLine({ sizes: event.target.value })}
              placeholder={`Ex.: ${Math.ceil(plan.needed / 2)} M e ${Math.floor(plan.needed / 2)} G`}
              aria-describedby={`${id}-tamanhos-dica`}
              autoComplete="off"
              className="h-11 w-full rounded-control border border-line-strong bg-white px-3 text-sm placeholder:text-muted focus:border-ink"
            />
            <p id={`${id}-tamanhos-dica`} className="mt-1.5 text-caption text-muted">
              {plan.item.product.sizes?.length ? `Grade: ${plan.item.product.sizes.join(", ")}. ` : ""}Se preferir, a equipe confirma os tamanhos com você depois do pedido.
            </p>
          </div>
        )}

        {plan.error && (
          <p role="alert" className="text-sm font-semibold text-coral-700">
            {plan.error}
          </p>
        )}
      </div>

      {status.tone !== "blank" && (
        <div className={cx("mt-4 flex flex-wrap items-center gap-3 rounded-control p-2.5 sm:flex-nowrap", missing ? "bg-coral-50" : "bg-mist")}>
          <ArtThumb art={view.art} spec={view.spec} label={plan.item.product.name} className="w-24 shrink-0" />
          <div className="min-w-0 flex-1 basis-40">
            <p className={cx("text-sm font-bold", missing && "text-coral-700")}>
              <span className="sr-only">Arte: </span>
              {status.label}
            </p>
            <p className="text-caption text-muted">{status.detail}</p>
          </div>
          <Button variant={missing ? "dark" : "outline"} size="sm" icon={<IconBrush className="size-4" />} onClick={onEdit} className="max-sm:w-full">
            Personalizar<span className="sr-only"> {item.title}</span>
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          aria-pressed={previewing}
          onClick={onPreview}
          className={cx("inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline", previewing ? "text-ink" : "text-preview")}
        >
          <IconCube className="size-4" /> Ver em 3D
        </button>
        <Link href={`/produto/${plan.item.product.slug}`} target="_blank" className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Detalhes do produto<span className="sr-only"> {plan.item.product.name} (abre em nova aba)</span>
        </Link>
        <button type="button" onClick={onRemove} className="ml-auto inline-flex min-h-11 items-center text-sm font-semibold text-muted underline-offset-4 hover:text-coral-700 hover:underline">
          Tirar do kit<span className="sr-only"> {item.title}</span>
        </button>
      </div>
    </li>
  );
}
