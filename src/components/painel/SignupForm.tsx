"use client";

import Link from "next/link";
import { useState } from "react";
import { cadastrar } from "@/app/(painel)/painel/actions";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { LOJISTA_TYPES, LOJISTA_TYPE_LABEL, PASSWORD_MIN, subdomainError, suggestSubdomain } from "@/lib/multiloja/core";
import { useFormAction } from "./useFormAction";
import { Field, FormMessage } from "./fields";

/** Cadastro do lojista e da loja numa tela só. O endereço é sugerido pelo nome da loja e mostrado ao vivo. */
export default function SignupForm({ domainSuffix }: { domainSuffix: string }) {
  const { state, submit, pending } = useFormAction(cadastrar);
  const [storeName, setStoreName] = useState("");
  const [sub, setSub] = useState("");
  const [subTouched, setSubTouched] = useState(false);
  const errors = state?.errors ?? {};
  const address = subTouched ? sub : suggestSubdomain(storeName);
  const addressProblem = address ? subdomainError(address) : null;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FormMessage state={state} />

      <fieldset>
        <legend className="mb-2 text-[15px] font-bold">Você é</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {LOJISTA_TYPES.map((tipo, i) => (
            <label key={tipo} className="flex cursor-pointer items-start gap-2 rounded-control border border-line p-3 text-[14px] leading-snug has-[:checked]:border-ink has-[:checked]:bg-mist">
              <input type="radio" name="tipo" value={tipo} defaultChecked={i === 0} className="mt-0.5 accent-ink" />
              {LOJISTA_TYPE_LABEL[tipo]}
            </label>
          ))}
        </div>
        {errors.tipo && <p className="mt-1.5 text-caption font-semibold text-coral-700">{errors.tipo}</p>}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Seu nome" name="nome" autoComplete="name" required maxLength={80} error={errors.nome} />
        <Field label="WhatsApp" name="telefone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" required error={errors.telefone} hint="Também vira o contato da loja." />
      </div>
      <Field label="E-mail" name="email" type="email" autoComplete="email" required maxLength={160} error={errors.email} />
      <Field label="Senha" name="senha" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} error={errors.senha} hint={`Pelo menos ${PASSWORD_MIN} caracteres.`} />

      <div className="rounded-control bg-mist p-4">
        <Field label="Nome da loja" name="loja" required maxLength={60} value={storeName} onChange={(e) => setStoreName(e.target.value)} error={errors.loja} placeholder="Ex.: Ateliê da Ana" />
        <div className="mt-4">
          <label htmlFor="campo-subdominio" className="mb-1.5 block text-[15px] font-bold">
            Endereço da loja
          </label>
          <div className={cx("flex h-12 items-center overflow-hidden rounded-control border bg-white focus-within:border-ink", errors.subdominio || (subTouched && addressProblem) ? "border-coral-700" : "border-line")}>
            <input
              id="campo-subdominio"
              name="subdominio"
              value={address}
              onChange={(e) => {
                setSubTouched(true);
                setSub(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              maxLength={30}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="subdominio-dica"
              className="h-full min-w-0 flex-1 px-4 text-body outline-none"
            />
            <span className="shrink-0 pr-4 text-[15px] text-muted">{domainSuffix}</span>
          </div>
          <p id="subdominio-dica" className={cx("mt-1.5 text-caption", errors.subdominio || (subTouched && addressProblem) ? "font-semibold text-coral-700" : "text-muted")}>
            {errors.subdominio ?? (subTouched && addressProblem) ?? "Letras minúsculas, números e hífen. Dá para mudar depois."}
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 text-[15px]">
        <input type="checkbox" name="aceite" className="mt-1 size-4 accent-ink" />
        <span>
          Li e aceito os termos de uso da multiloja Padrão Color.
          {errors.aceite && <span className="mt-1 block text-caption font-semibold text-coral-700">{errors.aceite}</span>}
        </span>
      </label>

      <Button type="submit" size="md" block loading={pending}>
        Criar minha loja
      </Button>
      <p className="text-center text-[15px] text-muted">
        Já tem loja?{" "}
        <Link href="/painel/entrar" className="font-bold text-ink underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </form>
  );
}
