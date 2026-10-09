"use client";

import { useState, useTransition, type ReactNode } from "react";
import { alternarLoja, bloquearLojista, definirPlano, marcarDominio, type AdminResult } from "@/app/(admin)/admin/actions";
import { cx } from "@/components/ui/cx";
import { PLANS, PLAN_INFO } from "@/lib/multiloja/core";
import { ResetPassword } from "./LojistaForms";

type Props = { lojaId: number; lojistaId: number; plano: string; ativa: boolean; bloqueado: boolean; dominio: string | null; dominioVerificado: boolean };

const action = "h-9 shrink-0 rounded-full border border-line-strong px-3.5 text-[13px] font-bold transition-colors hover:border-ink disabled:opacity-50";

function Row({ label, value, children }: { label: string; value: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-muted">{label}</span>
        <span className="text-[14px] font-semibold">{value}</span>
      </span>
      {children}
    </li>
  );
}

/** Controles da loja no admin: plano, loja no ar, acesso do lojista, senha e domínio próprio. */
export default function AdminStoreRow({ lojaId, lojistaId, plano, ativa, bloqueado, dominio, dominioVerificado }: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const run = (fn: () => Promise<AdminResult>) => startTransition(async () => setResult(await fn()));
  return (
    <div>
      <ul className="divide-y divide-line">
        <Row label="Plano" value={PLAN_INFO[plano as keyof typeof PLAN_INFO]?.blurb ?? plano}>
          <label className="sr-only" htmlFor={`plano-${lojaId}`}>
            Plano
          </label>
          <select id={`plano-${lojaId}`} defaultValue={plano} disabled={pending} onChange={(e) => run(() => definirPlano(lojaId, e.target.value))} className="h-9 rounded-full border border-line-strong bg-white px-3 text-[13px] font-bold">
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {PLAN_INFO[p].name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Loja" value={ativa ? "No ar" : "Fora do ar"}>
          <button type="button" disabled={pending} onClick={() => run(() => alternarLoja(lojaId, !ativa))} className={action}>
            {ativa ? "Tirar do ar" : "Colocar no ar"}
          </button>
        </Row>
        <Row label="Acesso do lojista ao painel" value={bloqueado ? "Bloqueado" : "Liberado"}>
          <button type="button" disabled={pending} onClick={() => run(() => bloquearLojista(lojistaId, !bloqueado))} className={cx(action, !bloqueado && "border-coral-700 text-coral-700 hover:border-coral-700 hover:bg-coral-50")}>
            {bloqueado ? "Liberar acesso" : "Bloquear acesso"}
          </button>
        </Row>
        <Row label="Senha do lojista" value="Gera uma nova e mostra uma vez">
          <ResetPassword lojistaId={lojistaId} />
        </Row>
        {dominio && (
          <Row label="Domínio próprio" value={`${dominio} · ${dominioVerificado ? "liberado" : "aguardando"}`}>
            <button type="button" disabled={pending} onClick={() => run(() => marcarDominio(lojaId, !dominioVerificado))} className={action}>
              {dominioVerificado ? "Desligar domínio" : "Liberar domínio"}
            </button>
          </Row>
        )}
      </ul>
      {result && (
        <p role="status" className={cx("mt-2 text-[13px] font-semibold", !result.ok && "text-coral-700")}>
          {result.message}
        </p>
      )}
    </div>
  );
}
