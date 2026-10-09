"use client";

import { useActionState, useState, useTransition, startTransition as start, type FormEvent } from "react";
import { alternarCadastro, criarLojista, redefinirSenhaLojista, type AdminResult, type CreatedLojista } from "@/app/(admin)/admin/actions";
import { Field, FormMessage } from "@/components/painel/fields";
import { Button } from "@/components/ui/Button";
import { LOJISTA_TYPES, LOJISTA_TYPE_LABEL, PLANS, PLAN_INFO, suggestSubdomain } from "@/lib/multiloja/core";

/* Admin → Lojas: criar lojista + loja (senha provisória mostrada uma vez), nova senha e cadastro público. */

export function NovoLojistaForm({ domainSuffix }: { domainSuffix: string }) {
  const [state, dispatch, pending] = useActionState<CreatedLojista, FormData>(criarLojista, null);
  const [loja, setLoja] = useState("");
  const [sub, setSub] = useState("");
  const [touched, setTouched] = useState(false);
  const errors = state?.errors ?? {};
  const address = touched ? sub : suggestSubdomain(loja);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    start(() => dispatch(data));
  };

  if (state?.ok && state.senha) {
    return (
      <div className="space-y-3 rounded-control bg-lime-50 p-5">
        <p className="text-lg font-bold">{state.message}</p>
        <p className="text-[15px]">
          Endereço: <strong>{state.loja}{domainSuffix}</strong>
        </p>
        <p className="text-[15px]">
          Senha provisória (mostrada só agora): <code className="rounded bg-white px-2 py-1 text-[16px] font-bold">{state.senha}</code>
        </p>
        <p className="text-caption">Envie ao lojista junto com o link do painel (/painel/entrar) e peça para trocar a senha em Minha conta.</p>
        <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
          Cadastrar outra loja
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Nome do lojista" name="nome" maxLength={80} error={errors.nome} />
        <Field label="E-mail de acesso" name="email" type="email" maxLength={160} error={errors.email} />
        <Field label="WhatsApp" name="telefone" type="tel" placeholder="(00) 00000-0000" error={errors.telefone} />
        <div>
          <label htmlFor="campo-tipo" className="mb-1.5 block text-[15px] font-bold">
            Perfil
          </label>
          <select id="campo-tipo" name="tipo" defaultValue="influenciador" className="h-12 w-full rounded-control border border-line bg-white px-3">
            {LOJISTA_TYPES.map((t) => (
              <option key={t} value={t}>
                {LOJISTA_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <Field label="Nome da loja" name="loja" value={loja} onChange={(e) => setLoja(e.target.value)} maxLength={60} error={errors.loja} />
        <Field
          label="Endereço"
          name="subdominio"
          value={address}
          onChange={(e) => {
            setTouched(true);
            setSub(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
          }}
          maxLength={30}
          error={errors.subdominio}
          hint={address ? `${address}${domainSuffix}` : undefined}
        />
        <div>
          <label htmlFor="campo-plano" className="mb-1.5 block text-[15px] font-bold">
            Plano
          </label>
          <select id="campo-plano" name="plano" defaultValue="gratis" className="h-12 w-full rounded-control border border-line bg-white px-3">
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {PLAN_INFO[p].name} ({PLAN_INFO[p].blurb.toLowerCase()})
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" size="sm" loading={pending}>
        Criar lojista e loja
      </Button>
    </form>
  );
}

export function ResetPassword({ lojistaId }: { lojistaId: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<(AdminResult & { senha?: string }) | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Gerar uma senha nova? A senha atual do lojista deixa de funcionar.")) startTransition(async () => setResult(await redefinirSenhaLojista(lojistaId)));
        }}
        className="h-9 rounded-full border border-line-strong px-3 text-[13px] font-bold hover:border-ink disabled:opacity-50"
      >
        Nova senha
      </button>
      {result && (
        <span role="status" className="text-caption font-semibold">
          {result.message} {result.senha && <code className="rounded bg-mist px-2 py-0.5 text-[14px]">{result.senha}</code>}
        </span>
      )}
    </span>
  );
}

export function SignupToggle({ open }: { open: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-[15px]">
        Cadastro público em /painel/cadastro: <strong>{open ? "aberto" : "fechado (só por aqui)"}</strong>
      </p>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => setResult(await alternarCadastro(!open)))}>
        {open ? "Fechar cadastro público" : "Abrir cadastro público"}
      </Button>
      {result && (
        <span role="status" className="text-caption font-semibold">
          {result.message}
        </span>
      )}
    </div>
  );
}
