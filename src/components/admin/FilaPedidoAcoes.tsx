"use client";

import { useState, useTransition } from "react";
import { cancelarFila, devolverFila, marcarFilaEnviado, reenviarFila } from "@/app/(admin)/admin/fila-actions";
import type { AdminResult } from "@/app/(admin)/admin/actions";
import type { EtapaFila } from "@/lib/fila-pedidos/regras";

const BOTAO = "h-9 rounded-full border border-line-strong px-4 text-[13px] font-bold hover:border-ink disabled:opacity-50";

/**
 * Ações de uma entrada da fila de pedidos do site: enviar agora, marcar como enviado com o número do pedido (criado
 * por fora ou confirmado no sistema da Padrão), devolver ao reenvio automático e cancelar.
 */
export function FilaPedidoAcoes({ protocolo, etapa }: { protocolo: string; etapa: EtapaFila }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const [numero, setNumero] = useState("");
  const [nota, setNota] = useState("");
  if (etapa !== "pendente" && etapa !== "conferir") return null;
  const run = (action: () => Promise<AdminResult>) => startTransition(async () => setResult(await action()));

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(() => reenviarFila(protocolo))} className="h-9 rounded-full bg-ink px-4 text-[13px] font-bold text-white hover:bg-coral-700 disabled:opacity-50">
          {etapa === "conferir" ? "Conferi: enviar agora" : "Enviar agora"}
        </button>
        {etapa === "conferir" && (
          <button type="button" disabled={pending} onClick={() => run(() => devolverFila(protocolo))} className={BOTAO}>
            Devolver ao reenvio automático
          </button>
        )}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => marcarFilaEnviado(protocolo, numero));
        }}
      >
        <label className="sr-only" htmlFor={`numero-${protocolo}`}>
          Número do pedido na Padrão
        </label>
        <input id={`numero-${protocolo}`} value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" placeholder="Nº do pedido na Padrão" className="h-9 w-48 rounded-control border border-line px-3 text-[13px]" />
        <button type="submit" disabled={pending || !numero.trim()} className={BOTAO}>
          Marcar como enviado
        </button>
      </form>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => cancelarFila(protocolo, nota));
        }}
      >
        <label className="sr-only" htmlFor={`nota-${protocolo}`}>
          Motivo do cancelamento
        </label>
        <input id={`nota-${protocolo}`} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Motivo (opcional)" className="h-9 w-48 rounded-control border border-line px-3 text-[13px]" />
        <button type="submit" disabled={pending} className="h-9 rounded-full border border-coral-700 px-4 text-[13px] font-bold text-coral-700 hover:bg-coral-50 disabled:opacity-50">
          Cancelar
        </button>
      </form>
      {result && (
        <p role="status" className={result.ok ? "text-[13px] font-semibold" : "text-[13px] font-semibold text-coral-700"}>
          {result.message}
        </p>
      )}
    </div>
  );
}
