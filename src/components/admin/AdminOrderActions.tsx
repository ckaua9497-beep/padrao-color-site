"use client";

import { useState, useTransition } from "react";
import { enviarProducao, mudarStatus, type AdminResult } from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/Button";
import { ORDER_NEXT, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/multiloja/core";

/** Ações do pedido no admin: mandar para a produção na Padrão e mudar o status (com nota no histórico). */
export default function AdminOrderActions({ codigo, status }: { codigo: string; status: OrderStatus }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const [nota, setNota] = useState("");
  const next = ORDER_NEXT[status];

  const run = (action: () => Promise<AdminResult>) =>
    startTransition(async () => {
      setResult(await action());
      setNota("");
    });

  return (
    <div className="w-full max-w-md space-y-3 rounded-card bg-white p-4 shadow-sheet">
      {status === "pago" && (
        <Button type="button" size="sm" block loading={pending} onClick={() => run(() => enviarProducao(codigo))}>
          Enviar para produção na Padrão
        </Button>
      )}
      {next.length > 0 && (
        <div className="space-y-2">
          <label htmlFor="nota" className="block text-caption font-semibold text-muted">
            Nota no histórico (opcional; código de rastreio, motivo…)
          </label>
          <input id="nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} className="h-10 w-full rounded-control border border-line px-3 text-[14px]" />
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => run(() => mudarStatus(codigo, s, nota))}
                className={s === "cancelado" ? "h-9 rounded-full border border-coral-700 px-4 text-[13px] font-bold text-coral-700 hover:bg-coral-50 disabled:opacity-50" : "h-9 rounded-full border border-line-strong px-4 text-[13px] font-bold hover:border-ink disabled:opacity-50"}
              >
                {s === "cancelado" && (status === "pago" || status === "em_producao") ? "Cancelar e devolver o pagamento" : `Marcar: ${ORDER_STATUS_LABEL[s]}`}
              </button>
            ))}
          </div>
        </div>
      )}
      {result && (
        <div role="status" className={result.ok ? "text-[14px] font-semibold" : "text-[14px] font-semibold text-coral-700"}>
          {result.message}
          {result.payload && (
            <details className="mt-2">
              <summary className="cursor-pointer text-caption">Ver dados enviados à Padrão</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-control bg-mist p-2 text-[11px] font-normal">{result.payload}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
