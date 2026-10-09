"use client";

import { useState, useTransition } from "react";
import { criarLink, removerLink } from "@/app/(painel)/painel/actions";
import { Button } from "@/components/ui/Button";
import { suggestSubdomain } from "@/lib/multiloja/core";
import CopyLink from "./CopyLink";
import { Field, FormMessage } from "./fields";
import { useFormAction } from "./useFormAction";

export function NovoLinkForm({ storeUrl }: { storeUrl: string }) {
  const { state, submit, pending } = useFormAction(criarLink);
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const value = touched ? slug : suggestSubdomain(nome).slice(0, 30);
  return (
    <form key={state?.ok ? `ok-${state.message}` : "form"} onSubmit={submit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Onde vai usar" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Bio do Instagram" maxLength={60} error={state?.errors?.nome} />
        <Field
          label="Nome curto do link"
          name="slug"
          value={value}
          onChange={(e) => {
            setTouched(true);
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
          }}
          maxLength={30}
          error={state?.errors?.slug}
          hint={value ? `${storeUrl.replace(/^https?:\/\//, "")}/?ref=${value}` : "Letras minúsculas, números e hífen."}
        />
      </div>
      <Button type="submit" size="sm" loading={pending}>
        Criar link
      </Button>
    </form>
  );
}

export function LinkActions({ id, url }: { id: number; url: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <CopyLink url={url} />
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => removerLink(id))}
        className="h-11 rounded-full border border-line px-4 text-[14px] font-semibold text-muted hover:border-ink hover:text-ink disabled:opacity-50"
      >
        Remover
      </button>
    </div>
  );
}
