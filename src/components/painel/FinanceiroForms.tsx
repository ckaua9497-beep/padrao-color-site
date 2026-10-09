"use client";

import { salvarChavePix, solicitarSaque } from "@/app/(painel)/painel/actions";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { WITHDRAW_MIN } from "@/lib/multiloja/core";
import { Field, FormMessage, Panel } from "./fields";
import { useFormAction } from "./useFormAction";

export default function FinanceiroForms({ chavePix, available }: { chavePix: string | null; available: number }) {
  const pix = useFormAction(salvarChavePix);
  const saque = useFormAction(solicitarSaque);
  const canWithdraw = Boolean(chavePix) && available >= WITHDRAW_MIN;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Pedir saque" description={`Mínimo de ${formatBRL(WITHDRAW_MIN)}. O Pix cai na sua chave em até 2 dias úteis.`} id="saque">
        <form key={saque.state?.ok ? "feito" : "form"} onSubmit={saque.submit} className="space-y-4" noValidate>
          <FormMessage state={saque.state} />
          <Field label="Valor (R$)" name="valor" inputMode="decimal" defaultValue={available >= WITHDRAW_MIN ? available.toFixed(2).replace(".", ",") : ""} error={saque.state?.errors?.valor} disabled={!canWithdraw} />
          <Button type="submit" size="sm" loading={saque.pending} disabled={!canWithdraw}>
            Pedir saque
          </Button>
          {!chavePix && <p className="text-caption text-muted">Cadastre a chave Pix ao lado para liberar o saque.</p>}
          {chavePix && available < WITHDRAW_MIN && <p className="text-caption text-muted">O saldo disponível ainda não chegou ao mínimo.</p>}
        </form>
      </Panel>
      <Panel title="Chave Pix para receber" description="CPF, CNPJ, e-mail, celular (+55…) ou chave aleatória, no seu nome." id="chave">
        <form onSubmit={pix.submit} className="space-y-4" noValidate>
          <FormMessage state={pix.state} />
          <Field label="Chave Pix" name="chavePix" defaultValue={chavePix ?? ""} maxLength={120} error={pix.state?.errors?.chavePix} />
          <Button type="submit" size="sm" variant="dark" loading={pix.pending}>
            Salvar chave
          </Button>
        </form>
      </Panel>
    </div>
  );
}
