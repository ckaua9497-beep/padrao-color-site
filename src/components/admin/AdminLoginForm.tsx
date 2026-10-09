"use client";

import { entrarAdmin } from "@/app/(admin)/admin/actions";
import { Field, FormMessage } from "@/components/painel/fields";
import { useFormAction } from "@/components/painel/useFormAction";
import { Button } from "@/components/ui/Button";

export default function AdminLoginForm() {
  const { state, submit, pending } = useFormAction(entrarAdmin);
  return (
    <form onSubmit={submit} className="space-y-5">
      <FormMessage state={state} />
      <Field label="E-mail" name="email" type="email" autoComplete="username" required />
      <Field label="Senha" name="senha" type="password" autoComplete="current-password" required />
      <Button type="submit" size="md" block loading={pending}>
        Entrar
      </Button>
    </form>
  );
}
