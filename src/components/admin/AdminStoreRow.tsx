"use client";

import { useState, useTransition } from "react";
import { alternarLoja, bloquearLojista, definirPlano, marcarDominio, type AdminResult } from "@/app/(admin)/admin/actions";
import { PLANS, PLAN_INFO } from "@/lib/multiloja/core";

type Props = { lojaId: number; lojistaId: number; plano: string; ativa: boolean; bloqueado: boolean; dominio: string | null; dominioVerificado: boolean };

/** Controles da loja no admin: plano, loja no ar, acesso do lojista e domínio próprio. */
export default function AdminStoreRow({ lojaId, lojistaId, plano, ativa, bloqueado, dominio, dominioVerificado }: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const run = (action: () => Promise<AdminResult>) => startTransition(async () => setResult(await action()));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`plano-${lojaId}`}>
        Plano
      </label>
      <select id={`plano-${lojaId}`} defaultValue={plano} disabled={pending} onChange={(e) => run(() => definirPlano(lojaId, e.target.value))} className="h-9 rounded-full border border-line bg-white px-3 text-[14px]">
        {PLANS.map((p) => (
          <option key={p} value={p}>
            {PLAN_INFO[p].name}
          </option>
        ))}
      </select>
      <button type="button" disabled={pending} onClick={() => run(() => alternarLoja(lojaId, !ativa))} className="h-9 rounded-full border border-line-strong px-3 text-[13px] font-bold hover:border-ink disabled:opacity-50">
        {ativa ? "Tirar do ar" : "Colocar no ar"}
      </button>
      <button type="button" disabled={pending} onClick={() => run(() => bloquearLojista(lojistaId, !bloqueado))} className="h-9 rounded-full border border-line-strong px-3 text-[13px] font-bold hover:border-ink disabled:opacity-50">
        {bloqueado ? "Liberar acesso" : "Bloquear acesso"}
      </button>
      {dominio && (
        <button type="button" disabled={pending} onClick={() => run(() => marcarDominio(lojaId, !dominioVerificado))} className="h-9 rounded-full border border-line-strong px-3 text-[13px] font-bold hover:border-ink disabled:opacity-50">
          {dominioVerificado ? `Desligar ${dominio}` : `Liberar domínio ${dominio}`}
        </button>
      )}
      {result && (
        <span role="status" className={result.ok ? "text-caption font-semibold" : "text-caption font-semibold text-coral-700"}>
          {result.message}
        </span>
      )}
    </div>
  );
}
