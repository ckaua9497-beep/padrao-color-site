"use client";

import { useActionState, useState, useTransition, startTransition as start, type FormEvent } from "react";
import { alternarCadastro, criarLojista, redefinirSenhaLojista, type AdminResult, type CreatedLojista } from "@/app/(admin)/admin/actions";
import { Field, FormMessage } from "@/components/painel/fields";
import { useRouter } from "next/navigation";
import { IconClose, IconPlus } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { LOJISTA_TYPES, LOJISTA_TYPE_LABEL, PLANS, PLAN_INFO, suggestSubdomain } from "@/lib/multiloja/core";

/* Admin → Lojas: criar lojista + loja (senha provisória mostrada uma vez), nova senha e cadastro público. */

export function NovoLojistaForm({ domainSuffix, onDone }: { domainSuffix: string; onDone?: () => void }) {
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
        {onDone ? (
          <Button type="button" size="sm" variant="dark" onClick={onDone}>
            Concluir
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
            Cadastrar outra loja
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
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
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {result && (
        <span role="status" className="text-[13px] font-semibold">
          {result.senha ? (
            <>
              Nova senha: <code className="select-all rounded-thumb bg-mist px-2 py-1 text-[14px] font-bold">{result.senha}</code>
            </>
          ) : (
            result.message
          )}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Gerar uma senha nova? A senha atual do lojista deixa de funcionar.")) startTransition(async () => setResult(await redefinirSenhaLojista(lojistaId)));
        }}
        className="h-9 shrink-0 rounded-full border border-line-strong px-3.5 text-[13px] font-bold transition-colors hover:border-ink disabled:opacity-50"
      >
        Gerar nova senha
      </button>
    </span>
  );
}

export function SignupToggle({ open }: { open: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className={open ? "size-2 rounded-full bg-lime-700" : "size-2 rounded-full bg-line-strong"} />
        Cadastro público: <strong className="font-semibold">{open ? "aberto" : "fechado (só por convite)"}</strong>
      </span>
      <button type="button" disabled={pending} onClick={() => startTransition(async () => setResult(await alternarCadastro(!open)))} className="font-semibold underline underline-offset-2 hover:text-coral-700 disabled:opacity-50">
        {open ? "Fechar" : "Abrir"}
      </button>
      {result && !result.ok && (
        <span role="alert" className="font-semibold text-coral-700">
          {result.message}
        </span>
      )}
    </div>
  );
}

/** Botão "Nova loja" do cabeçalho: o formulário abre numa gaveta, sem empurrar a lista para baixo. */
export function NovaLojaDrawer({ domainSuffix }: { domainSuffix: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpen(false);
    setRound((r) => r + 1);
    router.refresh();
  };
  return (
    <>
      <Button type="button" size="sm" variant="dark" onClick={() => setOpen(true)} icon={<IconPlus className="size-4" />}>
        Nova loja
      </Button>
      <Drawer open={open} onClose={close} label="Nova loja" width="w-[520px]">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="text-[18px] font-black">Nova loja</h2>
            <p className="mt-0.5 text-[13px] text-muted">Cria o acesso do lojista e a loja. A senha provisória aparece uma vez para você repassar.</p>
          </div>
          <button type="button" onClick={close} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-mist">
            <IconClose className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <NovoLojistaForm key={round} domainSuffix={domainSuffix} onDone={close} />
        </div>
      </Drawer>
    </>
  );
}
