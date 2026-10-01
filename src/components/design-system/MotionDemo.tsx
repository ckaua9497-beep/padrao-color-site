"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { usePrefersReducedMotion } from "@/components/ui/useMediaQuery";

export type EaseCurve = { name: string; value: string; points: [number, number, number, number]; note: string };

// Onde cada curva é usada no site.
const USES: Record<string, string> = {
  "ease-reveal": "Entrada de blocos (.reveal), fade-up, word-reveal",
  "ease-card": "Zoom da foto no hover do card",
  "ease-button": "Cor e borda de botões (padrão das transições)",
  "ease-highlight": "Marca-texto (.marker) preenchendo",
  "ease-drawer": "Gaveta lateral entrando",
};

/** Curvas de easing do tema: gráfico da curva e uma bolinha percorrendo a trilha com a mesma curva. */
export function MotionDemo({ curves }: { curves: EaseCurve[] }) {
  const [played, setPlayed] = useState(false);
  const reduced = usePrefersReducedMotion();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="dark" size="sm" onClick={() => setPlayed((v) => !v)}>
          {played ? "Voltar" : "Reproduzir curvas"}
        </Button>
        <p className="text-caption text-muted" aria-live="polite">
          {reduced ? "Seu sistema pede movimento reduzido: as bolinhas pulam direto para o fim." : "Duração de 1,2 s em todas para comparar o formato."}
        </p>
      </div>
      <ul className="mt-6 grid gap-4">
        {curves.map((curve) => {
          const [x1, y1, x2, y2] = curve.points;
          // Gráfico 100 × 100 com y para cima; folga de 10 para as alças que passam de 1.
          const path = `M0,100 C${x1 * 100},${100 - y1 * 100} ${x2 * 100},${100 - y2 * 100} 100,0`;
          return (
            <li key={curve.name} className="grid items-center gap-4 rounded-card bg-white p-4 shadow-card sm:grid-cols-[88px_minmax(0,1fr)]">
              <svg viewBox="-10 -10 120 120" className="size-22 shrink-0 rounded-thumb bg-mist" aria-hidden>
                <line x1="0" y1="100" x2="100" y2="0" className="stroke-line-strong" strokeDasharray="3 4" strokeWidth="1.5" />
                <line x1="0" y1="100" x2={x1 * 100} y2={100 - y1 * 100} className="stroke-subtle" strokeWidth="1.5" />
                <line x1="100" y1="0" x2={x2 * 100} y2={100 - y2 * 100} className="stroke-subtle" strokeWidth="1.5" />
                <path d={path} fill="none" className="stroke-coral" strokeWidth="5" strokeLinecap="round" />
                <circle cx={x1 * 100} cy={100 - y1 * 100} r="5" className="fill-ink" />
                <circle cx={x2 * 100} cy={100 - y2 * 100} r="5" className="fill-ink" />
              </svg>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-bold">
                    {curve.name}
                    <code className="ml-2 text-caption font-normal text-muted">{curve.value}</code>
                  </p>
                  <p className="text-caption text-muted">{USES[curve.name] ?? curve.note}</p>
                </div>
                <div className="relative mt-3 h-7 rounded-full bg-mist">
                  <span
                    aria-hidden
                    className="absolute top-1 size-5 rounded-full bg-coral shadow-float transition-[left] duration-1200 motion-reduce:transition-none"
                    style={{ left: played ? "calc(100% - 1.5rem)" : "0.25rem", transitionTimingFunction: `var(--${curve.name})` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
