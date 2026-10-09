"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { FormState } from "@/app/(painel)/painel/actions";

/**
 * useActionState sem o reset automático do React 19 (que apagaria o que a pessoa digitou quando o servidor
 * devolve erro de validação). Use `<form onSubmit={submit}>`.
 */
export function useFormAction(action: (prev: FormState, form: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState(action, null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };
  return { state, submit, pending };
}
