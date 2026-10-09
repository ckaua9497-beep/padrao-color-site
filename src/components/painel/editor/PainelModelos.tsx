"use client";

import { useMemo, useState } from "react";
import { cx } from "@/components/ui/cx";
import { PALETTES } from "@/lib/multiloja/core";
import { MODELOS, MODELO_KEYS, aplicarModelo, type LojaInfo, type ModeloKey, type Tema } from "@/lib/multiloja/tema";
import Miniatura from "./Miniatura";

/*
 * Modelos prontos: a loja inteira montada num clique (seções, cores, fonte, cabeçalho e rodapé), com os textos já
 * preenchidos com o nome da loja. Depois é só trocar o que quiser. Aplicar dá para desfazer (Ctrl+Z / Desfazer).
 */

export default function PainelModelos({ tema, info, onAplicar }: { tema: Tema; info: LojaInfo; onAplicar: (tema: Tema, nome: string) => void }) {
  const [manterCor, setManterCor] = useState(true);
  const paleta = tema.estilo.paleta;
  const previews = useMemo(
    () => Object.fromEntries(MODELO_KEYS.map((key) => [key, aplicarModelo(key, info, { paleta: manterCor ? paleta : MODELOS[key].paleta, logo: tema.marca.logo })])) as Record<ModeloKey, Tema>,
    [info, manterCor, paleta, tema.marca.logo],
  );
  return (
    <div className="space-y-4 p-4">
      <p className="text-[13px] leading-relaxed text-muted">Escolha um ponto de partida. Os textos já vêm com o nome da sua loja; depois é só trocar o que quiser. Dá para desfazer.</p>
      <label className="flex items-center gap-2 rounded-control bg-mist px-3 py-2.5 text-[13px] font-semibold">
        <input type="checkbox" checked={manterCor} onChange={(e) => setManterCor(e.target.checked)} className="size-4 accent-ink" />
        Manter a minha cor
        <span aria-hidden className="ml-auto size-4 rounded-full" style={{ background: PALETTES[paleta].main }} />
      </label>
      <ul className="space-y-3">
        {MODELO_KEYS.map((key) => {
          const atual = tema.modelo === key;
          return (
            <li key={key} className={cx("overflow-hidden rounded-card border bg-white", atual ? "border-ink ring-1 ring-ink" : "border-line")}>
              <Miniatura tema={previews[key]} className="rounded-none border-0 border-b" />
              <div className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold">
                    {MODELOS[key].nome}
                    {atual && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[11px] text-white">Em uso</span>}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted">{MODELOS[key].descricao}</p>
                </div>
                <button type="button" onClick={() => onAplicar(previews[key], MODELOS[key].nome)} className="h-9 shrink-0 rounded-full bg-ink px-4 text-[13px] font-bold text-white transition-colors hover:bg-coral-700">
                  Usar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
