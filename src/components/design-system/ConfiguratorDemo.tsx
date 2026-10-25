"use client";

import { useState } from "react";
import { IconCube } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { Price } from "@/components/ui/Price";
import { formatBRL } from "@/lib/format";

// Tabela de exemplo: preço base por quantidade, somado aos adicionais de papel e acabamento.
type Step = { key: string; values: string[]; add: number[] };
const STEPS: Step[] = [
  { key: "Quantidade", values: ["250 un.", "500 un.", "1.000 un."], add: [0, 0, 0] },
  { key: "Papel", values: ["Couchê 300 g", "Kraft 240 g", "Perolado 250 g"], add: [0, 12, 28] },
  { key: "Acabamento", values: ["Sem laminação", "Laminação fosca", "Verniz localizado"], add: [0, 18, 34] },
];
const BASE = [59.9, 79.9, 119.9];

/** Passo do configurador como na página de produto: opções numeradas e preço ao vivo. */
export function ConfiguratorDemo() {
  const [picked, setPicked] = useState<number[]>([1, 0, 1]);
  const total = BASE[picked[0]] + STEPS[1].add[picked[1]] + STEPS[2].add[picked[2]];
  const steps = STEPS.length + 1;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ol className="space-y-6">
        {STEPS.map((step, i) => (
          <li key={step.key}>
            <p className="mb-2.5 flex items-center gap-2 text-[15px] font-bold">
              <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">{i + 1}</span>
              {step.key}
              <span className="text-caption font-normal text-muted">
                · opção {i + 1} de {steps}
              </span>
            </p>
            <OptionGroup
              label={step.key}
              value={step.values[picked[i]]}
              onChange={(value) => setPicked((prev) => prev.map((p, j) => (j === i ? Math.max(0, step.values.indexOf(value)) : p)))}
              options={step.values.map((value, j) => ({
                value,
                label: step.add[j] ? (
                  <>
                    {value} <span className="text-caption text-muted">+{formatBRL(step.add[j])}</span>
                  </>
                ) : (
                  value
                ),
              }))}
            />
          </li>
        ))}
        <li>
          <p className="mb-2.5 flex items-center gap-2 text-[15px] font-bold">
            <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] text-white">{steps}</span>
            Sua arte
            <span className="text-caption font-normal text-muted">
              · opção {steps} de {steps}
            </span>
          </p>
          <p className="rounded-control border border-dashed border-line-strong bg-white px-4 py-3 text-sm text-muted">
            Envio da imagem ou texto em um modelo pronto (ArtStep): o mockup 3D atualiza na hora.
          </p>
        </li>
      </ol>

      <aside aria-label="Resumo do preço" className="self-start rounded-card bg-mist p-5">
        <Price size="pdp" value={total} unit={`por ${STEPS[0].values[picked[0]]}`} live />
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-line-strong/60 pt-4 text-sm tabular-nums">
          <dt className="font-bold">Total</dt>
          <dd className="font-bold">{formatBRL(total)}</dd>
        </dl>
        <Button variant="preview" size="sm" block className="mt-5" icon={<IconCube className="size-4" />}>
          Pré-visualizar
        </Button>
        <Button variant="buy" block className="mt-2">
          Adicionar ao carrinho
        </Button>
      </aside>
    </div>
  );
}
