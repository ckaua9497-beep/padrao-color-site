"use client";

import { salvarConta, trocarSenha } from "@/app/(painel)/painel/actions";
import { Button } from "@/components/ui/Button";
import { PASSWORD_MIN, formatPhone } from "@/lib/multiloja/core";
import { Field, FormMessage, Panel } from "./fields";
import { useFormAction } from "./useFormAction";

export default function ContaForms({ nome, email, telefone }: { nome: string; email: string; telefone: string | null }) {
  const conta = useFormAction(salvarConta);
  const senha = useFormAction(trocarSenha);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Seus dados" id="dados">
        <form onSubmit={conta.submit} className="space-y-4" noValidate>
          <FormMessage state={conta.state} />
          <Field label="Nome" name="nome" defaultValue={nome} maxLength={80} error={conta.state?.errors?.nome} />
          <Field label="E-mail de acesso" name="email-fixo" defaultValue={email} disabled hint="Para trocar o e-mail, fale com o suporte." />
          <Field label="Telefone" name="telefone" type="tel" defaultValue={telefone ? formatPhone(telefone) : ""} error={conta.state?.errors?.telefone} />
          <Button type="submit" size="sm" loading={conta.pending}>
            Salvar
          </Button>
        </form>
      </Panel>
      <Panel title="Trocar senha" id="senha">
        {/* key: a senha some dos campos depois de trocada. */}
        <form key={senha.state?.ok ? "trocada" : "form"} onSubmit={senha.submit} className="space-y-4" noValidate>
          <FormMessage state={senha.state} />
          <Field label="Senha atual" name="atual" type="password" autoComplete="current-password" error={senha.state?.errors?.atual} />
          <Field label="Nova senha" name="nova" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} error={senha.state?.errors?.nova} hint={`Pelo menos ${PASSWORD_MIN} caracteres.`} />
          <Button type="submit" size="sm" loading={senha.pending}>
            Trocar senha
          </Button>
        </form>
      </Panel>
    </div>
  );
}
