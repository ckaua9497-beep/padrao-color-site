"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { formatPhone, isValidBirthDate, isValidEmail, isValidPhone, passwordMessage, PASSWORD_RULES } from "@/lib/api/validation";
import { postJson } from "./client-api";
import { FormAlert, PasswordField } from "./FormBits";

type Contact = { telefone1: string; telefone2: string; email: string; nascimento: string };

/** Telefones, e-mail e nascimento → POST /api/conta/dados (POST /atualizacliente). Campo vazio não muda. */
export function ContactForm({ initial }: { initial: Contact }) {
  const router = useRouter();
  const [form, setForm] = useState<Contact>(initial);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: keyof Contact) => (value: string) => {
    setForm((current) => ({ ...current, [field]: field.startsWith("telefone") ? formatPhone(value) : value }));
    setDone(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Só o que a pessoa mudou: o valor antigo da API (telefone sem DDD, com +55…) não pode travar nem
    // sobrescrever o cadastro quando ela troca só o e-mail.
    const changed: Partial<Contact> = Object.fromEntries((Object.keys(form) as (keyof Contact)[]).filter((key) => form[key].trim() !== initial[key].trim()).map((key) => [key, form[key]]));
    if (!Object.keys(changed).length) {
      setError("Altere algum dado para salvar.");
      return;
    }
    const problem =
      (changed.telefone1 && !isValidPhone(changed.telefone1) && "Telefone principal inválido: use DDD + número.") ||
      (changed.telefone2 && !isValidPhone(changed.telefone2) && "Segundo telefone inválido: use DDD + número.") ||
      (changed.email && !isValidEmail(changed.email) && "E-mail inválido.") ||
      (changed.nascimento && !isValidBirthDate(changed.nascimento) && "Data de nascimento inválida.") ||
      null;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const reply = await postJson<{ message?: string }>("/api/conta/dados", changed);
    setBusy(false);
    if (!reply.ok) {
      setError(reply.error);
      if (reply.status === 401) router.refresh();
      return;
    }
    setDone(reply.data.message ?? "Dados atualizados.");
    router.refresh();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Telefone principal" type="tel" value={form.telefone1} onChange={set("telefone1")} autoComplete="tel" inputMode="tel" placeholder="(21) 90000-0000" />
        <TextField label="Outro telefone (opcional)" type="tel" value={form.telefone2} onChange={set("telefone2")} autoComplete="tel" inputMode="tel" />
        <TextField label="E-mail" type="email" value={form.email} onChange={set("email")} autoComplete="email" inputMode="email" />
        <TextField label="Data de nascimento" type="date" value={form.nascimento} onChange={set("nascimento")} autoComplete="bday" hint="Opcional. A Padrão não devolve essa data na consulta: preencha só para atualizar." />
      </div>
      {error && <FormAlert>{error}</FormAlert>}
      {done && <FormAlert tone="success">{done}</FormAlert>}
      <Button type="submit" variant="dark" size="sm" loading={busy}>
        Salvar dados
      </Button>
    </form>
  );
}

/** Troca de senha: confere a atual e grava a nova (POST /api/conta/senha). */
export function PasswordForm() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = !atual ? "Informe a senha atual." : (passwordMessage(nova) ?? (nova !== confirmacao ? "As senhas não conferem." : null));
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    const reply = await postJson<{ message?: string }>("/api/conta/senha", { atual, nova });
    setBusy(false);
    if (!reply.ok) {
      setError(reply.error);
      return;
    }
    setAtual("");
    setNova("");
    setConfirmacao("");
    setDone(reply.data.message ?? "Senha alterada.");
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <PasswordField label="Senha atual" value={atual} onChange={setAtual} show={show} autoComplete="current-password" />
      <div className="grid gap-4 md:grid-cols-2">
        <PasswordField label="Nova senha" value={nova} onChange={setNova} show={show} autoComplete="new-password" hint={`De ${PASSWORD_RULES.min} a ${PASSWORD_RULES.max} caracteres, com letra e número.`} />
        <PasswordField label="Confirme a nova senha" value={confirmacao} onChange={setConfirmacao} show={show} onToggle={setShow} autoComplete="new-password" />
      </div>
      {error && <FormAlert>{error}</FormAlert>}
      {done && <FormAlert tone="success">{done}</FormAlert>}
      <Button type="submit" variant="dark" size="sm" loading={busy}>
        Trocar senha
      </Button>
    </form>
  );
}
