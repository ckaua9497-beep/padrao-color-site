"use client";

import { useState } from "react";
import { AccordionItem } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { DEFAULT_REALISM, type Realism } from "@/lib/facade";
import { RangeField } from "./parts";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const signed = (value: number) => (Math.round(value * 100) === 0 ? "0%" : `${value > 0 ? "+" : "−"}${Math.abs(Math.round(value * 100))}%`);

/** Ajustes de realismo da simulação: luz e sombra da foto sobre a arte, brilho e bordas. */
export function RealismPanel({ realism, onChange }: { realism: Realism; onChange: (realism: Realism) => void }) {
  const [open, setOpen] = useState(false);
  const changed = realism.light !== DEFAULT_REALISM.light || realism.brightness !== DEFAULT_REALISM.brightness || realism.edges !== DEFAULT_REALISM.edges;

  return (
    <AccordionItem
      open={open}
      onToggle={() => setOpen((value) => !value)}
      className="mt-4 rounded-card bg-mist px-4"
      buttonClassName="min-h-11 py-3"
      title={
        <span className="grid text-left">
          <span className="text-[15px] font-bold">Ajustes de realismo</span>
          <span className="text-caption text-muted">Luz da foto {percent(realism.light)} · brilho {signed(realism.brightness)} · bordas {percent(realism.edges)}</span>
        </span>
      }
    >
      <div className="grid gap-3 pb-4">
        <RangeField label="Luz e sombra da foto" value={realism.light} min={0} max={1} step={0.05} format={percent} onChange={(light) => onChange({ ...realism, light })} />
        <RangeField label="Brilho do design" value={realism.brightness} min={-0.4} max={0.4} step={0.02} format={signed} onChange={(brightness) => onChange({ ...realism, brightness })} />
        <RangeField label="Bordas mais escuras" value={realism.edges} min={0} max={1} step={0.05} format={percent} onChange={(edges) => onChange({ ...realism, edges })} />
        <p className="text-caption text-muted">A luz da foto traz as sombras e o degradê da fachada para o design. Em foto de noite ou contra a luz, diminua.</p>
        {changed && (
          <Button variant="link" size="sm" className="min-h-11 justify-self-start" onClick={() => onChange(DEFAULT_REALISM)}>
            Voltar ao padrão
          </Button>
        )}
      </div>
    </AccordionItem>
  );
}
