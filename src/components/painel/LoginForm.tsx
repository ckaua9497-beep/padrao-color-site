"use client";

import Link from "next/link";
import { entrar } from "@/app/(painel)/painel/actions";
import { Button } from "@/components/ui/Button";
import { useFormAction } from "./useFormAction";
import { Field, FormMessage } from "./fields";

export default function LoginForm() {
  const { state, submit, pending } = useFormAction(entrar);
  return (
    <form onSubmit={submit} className="space-y-5">
      <FormMessage state={state} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" required maxLength={160} />
      <Field label="Senha" name="senha" type="password" autoComplete="current-password" required />
      <Button type="submit" size="md" block loading={pending}>
        Entrar no painel
      </Button>
      <p className="text-center text-[15px] text-muted">
        Ainda não tem loja?{" "}
        <Link href="/painel/cadastro" className="font-bold text-ink underline underline-offset-4">
          Crie a sua grátis
        </Link>
      </p>
    </form>
  );
}
