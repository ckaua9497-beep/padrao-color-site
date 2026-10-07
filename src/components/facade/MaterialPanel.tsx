"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AccordionItem } from "@/components/ui/Accordion";
import { OptionGroup } from "@/components/ui/OptionGroup";
import type { CustomSize, Variation } from "@/lib/catalog";
import { useCustomerVariations } from "@/lib/customer";
import { facadeQuote, type FacadeMaterial } from "@/lib/facade";
import { formatBRL, imageUrl } from "@/lib/format";
import { availableValues, cleanOptionLabel, optionKeys, quote, type Selection } from "@/lib/pricing";

const metres = (m: number) => m.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * "até 2,42 × 1,2 m" (chapa) ou "um dos lados até 3,15 m" (largura do rolo); null sem limite.
 * Limite de 10 m ou mais é o comprimento do rolo: na prática, livre para fachada. A peça pode girar.
 */
function limitLabel(limits: CustomSize | null): string | null {
  if (!limits) return null;
  const real = (value: number) => (value > 0 && value < 10 ? value : 0);
  const w = real(limits.maxWidth);
  const h = real(limits.maxHeight);
  if (w && h) return `até ${metres(w)} × ${metres(h)} m`;
  if (w || h) return `um dos lados até ${metres(w || h)} m`;
  return null;
}

/** Cartão de material: o preço por m² segue a tabela do cliente logado (revendedor ou balcão). */
function MaterialOption({ material, size }: { material: FacadeMaterial; size: { w: number; h: number } | null }) {
  const { variations } = useCustomerVariations(material, material.variations);
  const keys = optionKeys(material.options);
  const perM2 = quote(variations, material.selection, { price: material.price, qty: 1, leadDays: material.leadDays }, keys.length).price;
  const fits = size ? !facadeQuote(perM2, size.w, size.h, material.customSize).error : true;
  const limit = limitLabel(material.customSize);

  return (
    <span className="flex items-start gap-3">
      <Image src={imageUrl(material.image)} alt="" width={48} height={48} sizes="48px" className="size-12 shrink-0 rounded-thumb bg-mist object-contain" />
      <span className="grid min-w-0 gap-0.5">
        <span className="font-bold">{material.label}</span>
        <span className="text-caption font-normal text-muted">{material.use}</span>
        <span className="text-caption font-semibold text-price-sm tabular-nums">
          {formatBRL(perM2)}/m²{limit && <span className="font-normal text-muted"> · {limit}</span>}
        </span>
        {!fits && <span className="text-caption font-semibold text-coral-700">Não cabe na medida informada</span>}
      </span>
    </span>
  );
}

type Props = {
  materials: FacadeMaterial[];
  material: FacadeMaterial;
  onMaterial: (slug: string) => void;
  /** Variações do material escolhido já na tabela do cliente. */
  variations: Variation[];
  selection: Selection;
  onOption: (key: string, value: string) => void;
  size: { w: number; h: number } | null;
};

/** Passo do material: produtos vendidos por m² que servem de fachada e as opções de impressão de cada um. */
export function MaterialPanel({ materials, material, onMaterial, variations, selection, onOption, size }: Props) {
  const [open, setOpen] = useState(false);
  const keys = optionKeys(material.options);
  const summary = keys.map((key) => selection[key]).filter(Boolean).join(" · ");

  return (
    <div className="grid gap-4">
      <OptionGroup
        label="Material da fachada"
        value={material.slug}
        onChange={onMaterial}
        className="grid gap-2 sm:grid-cols-2"
        options={materials.map((m) => ({ value: m.slug, label: <MaterialOption material={m} size={size} /> }))}
      />

      {keys.length > 0 && (
        <AccordionItem
          open={open}
          onToggle={() => setOpen((value) => !value)}
          className="rounded-card bg-mist px-4"
          buttonClassName="min-h-11 py-3"
          title={
            <span className="grid text-left">
              <span className="text-[15px] font-bold">Impressão e acabamento</span>
              <span className="text-caption text-muted">{summary}</span>
            </span>
          }
        >
          <div className="grid gap-5 pb-5 pt-1">
            {keys.map((key) => {
              const values = material.options[key];
              const label = cleanOptionLabel(key);
              if (values.length === 1) {
                return (
                  <p key={key} className="text-sm">
                    <span className="font-semibold">{label}:</span> {values[0]}
                  </p>
                );
              }
              const available = availableValues(key, material.options, variations, selection);
              return (
                <div key={key}>
                  <p className="mb-2 text-sm font-semibold">{label}</p>
                  <OptionGroup label={label} value={selection[key]} onChange={(value) => onOption(key, value)} options={values.map((value) => ({ value, available: available.has(value) }))} />
                </div>
              );
            })}
            <p className="text-caption text-muted">
              Opções do produto{" "}
              <Link href={`/produto/${material.slug}`} className="font-semibold text-ink underline underline-offset-2">
                {material.name}
              </Link>
              , com o preço por m² da combinação escolhida.
            </p>
          </div>
        </AccordionItem>
      )}
    </div>
  );
}
