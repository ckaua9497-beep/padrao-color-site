import type { Metadata } from "next";
import ContaForms from "@/components/painel/ContaForms";
import { requirePainel } from "@/lib/multiloja/auth";
import { LOJISTA_TYPE_LABEL, PLAN_INFO } from "@/lib/multiloja/core";

export const metadata: Metadata = { title: "Minha conta" };

export default async function PainelConta() {
  const { lojista, loja } = await requirePainel();
  const plan = PLAN_INFO[loja.plano];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">Minha conta</h1>
        <p className="mt-1 text-muted">
          {LOJISTA_TYPE_LABEL[lojista.tipo] ?? lojista.tipo} · Plano {plan.name} ({plan.blurb.toLowerCase()})
        </p>
      </div>
      <ContaForms nome={lojista.nome} email={lojista.email} telefone={lojista.telefone} />
    </div>
  );
}
