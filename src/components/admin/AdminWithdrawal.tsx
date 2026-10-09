"use client";

import { useState, useTransition } from "react";
import { resolverSaque, type AdminResult } from "@/app/(admin)/admin/actions";

/** Pagar (depois de fazer o Pix) ou recusar um saque, com nota que o lojista vê. */
export default function AdminWithdrawal({ id }: { id: number }) {
  const [pending, startTransition] = useTransition();
  const [nota, setNota] = useState("");
  const [result, setResult] = useState<AdminResult | null>(null);
  const run = (status: "pago" | "recusado") => startTransition(async () => setResult(await resolverSaque(id, status, nota)));
  if (result?.ok) return <p role="status" className="text-[14px] font-semibold">{result.message}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`nota-${id}`} className="sr-only">
        Nota
      </label>
      <input id={`nota-${id}`} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (comprovante, motivo…)" maxLength={200} className="h-9 w-56 rounded-full border border-line px-3 text-[14px]" />
      <button type="button" disabled={pending} onClick={() => run("pago")} className="h-9 rounded-full bg-ink px-4 text-[13px] font-bold text-white hover:bg-coral-700 disabled:opacity-50">
        Pix feito: marcar pago
      </button>
      <button type="button" disabled={pending} onClick={() => run("recusado")} className="h-9 rounded-full border border-coral-700 px-4 text-[13px] font-bold text-coral-700 hover:bg-coral-50 disabled:opacity-50">
        Recusar
      </button>
      {result && !result.ok && (
        <span role="alert" className="text-caption font-semibold text-coral-700">
          {result.message}
        </span>
      )}
    </div>
  );
}
