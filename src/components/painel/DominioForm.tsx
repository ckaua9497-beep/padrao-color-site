"use client";

import { startTransition, useActionState } from "react";
import { salvarDominio, verificarDominio } from "@/app/(painel)/painel/actions";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Panel } from "./fields";
import { useFormAction } from "./useFormAction";

/** Domínio próprio (www.minhaloja.com.br): o lojista aponta o DNS e a loja passa a responder nele depois de verificado. */
export default function DominioForm({ dominio, verificado, alvo }: { dominio: string | null; verificado: boolean; alvo: string | null }) {
  const salvar = useFormAction(salvarDominio);
  const [verifyState, verify, verifying] = useActionState(verificarDominio, null);
  const state = verifyState ?? salvar.state;
  return (
    <Panel title="Domínio próprio (opcional)" description="Use um endereço seu, como www.minhaloja.com.br, além do endereço da multiloja." id="dominio">
      <form onSubmit={salvar.submit} className="space-y-4" noValidate>
        <FormMessage state={state} />
        <Field label="Domínio" name="dominio" defaultValue={dominio ?? ""} placeholder="www.minhaloja.com.br" error={salvar.state?.errors?.dominio} spellCheck={false} autoComplete="off" />
        {dominio && (
          <p className="text-[15px]">
            Situação: <strong>{verificado ? "verificado, a loja já responde nele" : "aguardando o DNS apontar para a multiloja"}</strong>
          </p>
        )}
        <ol className="list-decimal space-y-1 pl-5 text-[14px] text-muted">
          <li>No site onde você comprou o domínio (Registro.br, GoDaddy, Hostinger…), abra a área de DNS.</li>
          <li>
            Crie um registro <strong>CNAME</strong> com o nome <strong>www</strong> apontando para <strong>{alvo ?? "o endereço informado pela Padrão Color"}</strong>.
          </li>
          <li>Salve aqui e clique em verificar. A propagação pode levar algumas horas.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" loading={salvar.pending}>
            Salvar e verificar
          </Button>
          {dominio && !verificado && (
            <Button type="button" variant="outline" size="sm" loading={verifying} onClick={() => startTransition(() => verify())}>
              Verificar de novo
            </Button>
          )}
        </div>
      </form>
    </Panel>
  );
}
