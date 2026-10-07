"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { EMPTY_SIGNUP, PASSWORD_RULES, documentKind, formatCep, formatDocument, formatPhone, signupErrors, type SignupErrors, type SignupInput } from "@/lib/api/validation";
import { setCustomer } from "@/lib/customer";
import { lookupCep, postJson } from "./client-api";
import { FormAlert, FormSection, PasswordField, UfSelect } from "./FormBits";

type Props = {
  /** Conta criada. `loggedIn` = já entrou (login automático deu certo). */
  onSuccess: (result: { loggedIn: boolean; message?: string }) => void;
};

/** Cadastro → POST /api/conta/cadastro (POST /cadastrarcliente + login automático). */
export function SignupForm({ onSuccess }: Props) {
  const [form, setForm] = useState<SignupInput>(EMPTY_SIGNUP);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const kind = documentKind(form.documento);

  const set = (field: keyof SignupInput) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const onCep = async (value: string) => {
    const cep = formatCep(value);
    set("cep")(cep);
    if (cep.replace(/\D/g, "").length !== 8) {
      setCepStatus(null);
      return;
    }
    setCepStatus("Buscando o endereço…");
    const found = await lookupCep(cep);
    if (!found) {
      setCepStatus("CEP não encontrado. Preencha o endereço.");
      return;
    }
    setForm((current) => ({ ...current, logradouro: found.logradouro || current.logradouro, bairro: found.bairro || current.bairro, cidade: found.cidade || current.cidade, estado: found.estado || current.estado }));
    setCepStatus("Endereço encontrado. Confira e informe o número.");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = signupErrors(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setError("Confira os campos destacados.");
      return;
    }
    setBusy(true);
    setError(null);
    // A confirmação da senha fica no navegador.
    const reply = await postJson<{ loggedIn: boolean; customer?: unknown; message?: string }>("/api/conta/cadastro", { ...form, confirmacao: undefined, site: honeypot });
    setBusy(false);
    if (!reply.ok) {
      const fields = reply.data.fields;
      if (fields && typeof fields === "object") setErrors(fields as SignupErrors);
      setError(reply.error);
      return;
    }
    if (reply.data.loggedIn) setCustomer(reply.data.customer);
    onSuccess({ loggedIn: reply.data.loggedIn, message: reply.data.message });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      <FormSection title="Seus dados" description="Pessoa física ou jurídica: o tipo de cadastro segue o documento.">
        <TextField
          label="CPF ou CNPJ"
          value={form.documento}
          onChange={(value) => set("documento")(formatDocument(value))}
          error={errors.documento}
          inputMode={kind === "cnpj" ? "text" : "numeric"}
          autoComplete="off"
          required
          className="md:col-span-2"
        />
        <TextField label={kind === "cnpj" ? "Razão social" : "Nome completo"} value={form.nome} onChange={set("nome")} error={errors.nome} autoComplete={kind === "cnpj" ? "organization" : "name"} required />
        <TextField label={kind === "cnpj" ? "Nome fantasia (opcional)" : "Como prefere ser chamado (opcional)"} value={form.apelido} onChange={set("apelido")} autoComplete={kind === "cnpj" ? "off" : "nickname"} />
        {kind === "cnpj" ? (
          <>
            <TextField label="Inscrição estadual (opcional)" value={form.inscricaoEstadual} onChange={set("inscricaoEstadual")} autoComplete="off" />
            <TextField label="Responsável (opcional)" value={form.responsavel} onChange={set("responsavel")} autoComplete="name" />
          </>
        ) : (
          <TextField label="Data de nascimento (opcional)" type="date" value={form.nascimento} onChange={set("nascimento")} error={errors.nascimento} autoComplete="bday" />
        )}
        <TextField label="E-mail" type="email" value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" inputMode="email" required />
        <TextField label="Celular com DDD" type="tel" value={form.telefone} onChange={(value) => set("telefone")(formatPhone(value))} error={errors.telefone} autoComplete="tel" inputMode="tel" placeholder="(21) 90000-0000" required />
      </FormSection>

      <FormSection title="Endereço" description="Usamos para a nota fiscal e como endereço de entrega padrão.">
        <TextField
          label="CEP"
          value={form.cep}
          onChange={onCep}
          error={errors.cep}
          hint={cepStatus ?? undefined}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          required
        />
        <TextField label="Rua" value={form.logradouro} onChange={set("logradouro")} error={errors.logradouro} autoComplete="address-line1" required />
        <TextField label="Número" value={form.numero} onChange={set("numero")} error={errors.numero} autoComplete="address-line2" required />
        <TextField label="Complemento (opcional)" value={form.complemento} onChange={set("complemento")} autoComplete="address-line3" />
        <TextField label="Bairro" value={form.bairro} onChange={set("bairro")} error={errors.bairro} autoComplete="address-level3" required />
        <TextField label="Cidade" value={form.cidade} onChange={set("cidade")} error={errors.cidade} autoComplete="address-level2" required />
        <UfSelect value={form.estado} onChange={set("estado")} error={errors.estado} />
      </FormSection>

      <FormSection title="Acesso" description={`Senha com ${PASSWORD_RULES.min} a ${PASSWORD_RULES.max} caracteres, com pelo menos uma letra e um número.`}>
        <PasswordField label="Senha" value={form.senha} onChange={set("senha")} show={show} autoComplete="new-password" error={errors.senha} />
        <PasswordField label="Confirme a senha" value={form.confirmacao} onChange={set("confirmacao")} show={show} onToggle={setShow} autoComplete="new-password" error={errors.confirmacao} />
      </FormSection>

      {/* Campo isca contra robôs: fora da tela e fora do Tab. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Site
          <input type="text" name="site" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
        </label>
      </div>

      {error && <FormAlert>{error}</FormAlert>}
      <Button type="submit" variant="buy" size="md" block loading={busy}>
        Criar conta
      </Button>
      <p className="text-caption text-muted">Seus dados vão direto para o cadastro da Padrão Color e são usados só para atender seus pedidos.</p>
    </form>
  );
}
