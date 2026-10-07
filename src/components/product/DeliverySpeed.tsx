"use client";

import { OptionGroup } from "@/components/ui/OptionGroup";
import { formatBRL } from "@/lib/format";
import type { Speed } from "@/lib/pricing";

type Option = { price: number; days: number | null };

type Props = {
  value: Speed;
  onChange: (value: Speed) => void;
  economic: Option;
  express: Option;
  /** Unidade do preço: "por m²", "por peça", "por 1.000 un.". */
  unit: string;
};

const daysLabel = (days: number | null) => (days ? `${days} ${days === 1 ? "dia útil" : "dias úteis"}` : "prazo a confirmar");

/** Econômico × expresso: preço e prazo de produção de cada um (GET /produtos: preco/prazo econômico e expresso). */
export default function DeliverySpeed({ value, onChange, economic, express, unit }: Props) {
  const extra = Math.round((express.price - economic.price) * 100) / 100;
  const options: { value: Speed; title: string; days: string; price: string }[] = [
    { value: "economico", title: "Econômico", days: daysLabel(economic.days), price: `${formatBRL(economic.price)} ${unit}` },
    { value: "expresso", title: "Expresso", days: daysLabel(express.days), price: extra > 0 ? `+ ${formatBRL(extra)} ${unit}` : "mesmo preço" },
  ];
  return (
    <div>
      <p className="mb-2.5 text-[15px] font-bold">
        Prazo de produção <span className="text-caption font-normal text-muted">· em dias úteis, depois da aprovação da arte</span>
      </p>
      <OptionGroup
        label="Prazo de produção"
        value={value}
        onChange={(next) => onChange(next as Speed)}
        options={options.map((option) => ({
          value: option.value,
          label: (
            <span className="block py-0.5">
              <span className="block text-[15px] font-bold">{option.title}</span>
              <span className="block text-caption">{option.days}</span>
              <span className="block text-caption text-muted">{option.price}</span>
            </span>
          ),
        }))}
      />
    </div>
  );
}
