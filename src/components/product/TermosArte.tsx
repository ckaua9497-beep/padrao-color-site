"use client";

import { useId } from "react";
import { cx } from "@/components/ui/cx";
import { TERMOS_ARTE } from "@/lib/termos-arte";

/**
 * Campo dos termos de envio de arte (src/lib/termos-arte.ts): a caixa de aceite e os termos para ler. Na página de
 * todo produto personalizado (passo "Sua arte") e no checkout, para os itens que chegaram sem o aceite.
 */
export function TermosArte({ aceito, onAceito, faltando, id, detalhe, className }: { aceito: boolean; onAceito: (aceito: boolean) => void; faltando: boolean; id?: string; detalhe?: string; className?: string }) {
  const listaId = useId();
  return (
    <div id={id} className={cx("scroll-mt-painel rounded-card p-4 ring-1 transition-colors", faltando ? "bg-coral-50 ring-coral-700" : "bg-white ring-line", className)}>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={aceito} onChange={(event) => onAceito(event.target.checked)} aria-describedby={listaId} aria-invalid={faltando || undefined} className="mt-0.5 size-4 shrink-0 accent-coral-700" />
        <span>
          Li e aceito os <strong>{TERMOS_ARTE.titulo.toLowerCase()}</strong>
          {detalhe ? <span className="text-muted"> {detalhe}</span> : null}
        </span>
      </label>
      <details className="mt-2 pl-6.5 text-caption text-muted">
        <summary className="cursor-pointer font-semibold text-ink underline-offset-2 hover:underline">Ler os termos</summary>
        <ol id={listaId} className="mt-2 list-decimal space-y-1.5 pl-4">
          {TERMOS_ARTE.itens.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </details>
      {faltando && (
        <p role="alert" className="mt-2 text-sm font-semibold text-coral-700">
          Aceite os termos de envio de arte para continuar.
        </p>
      )}
    </div>
  );
}
