"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { cleanDocument, formatDocument, isValidDocument, isValidEmail, passwordMessage, PASSWORD_RULES } from "@/lib/api/validation";
import { postJson } from "./client-api";
import { FormAlert, PasswordField } from "./FormBits";

type Step = "documento" | "email" | "codigo" | "pronto" | "token";

type Props = {
  /** Link do e-mail de recuperação: /conta/recuperar?token=…&email=… */
  token?: string;
  email?: string;
  /** Para onde o login leva depois da nova senha (já validado pela página). */
  returnTo?: string;
};

const PASSWORD_HINT = `De ${PASSWORD_RULES.min} a ${PASSWORD_RULES.max} caracteres, com letra e número.`;

/**
 * Recuperação de acesso: documento → e-mail do cadastro (mascarado) → código por e-mail + nova senha.
 * Quem chega pelo link do e-mail (token) só define a nova senha (POST /alterarsenhaatual).
 */
export function RecoverFlow({ token = "", email: linkEmail = "", returnTo = "/conta" }: Props) {
  const back = returnTo === "/conta" ? "" : `?volta=${encodeURIComponent(returnTo)}`;
  const [step, setStep] = useState<Step>(token ? "token" : "documento");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState(linkEmail);
  const [hint, setHint] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const reply = await postJson<{ email?: string | null; message?: string | null }>("/api/conta/recuperar", body);
    setBusy(false);
    if (!reply.ok) setError(reply.error);
    return reply.ok ? reply.data : null;
  };

  const passwordProblem = () => passwordMessage(senha) ?? (senha !== confirmacao ? "As senhas não conferem." : null);

  const submitDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidDocument(documento)) {
      setError("Informe um CPF ou CNPJ válido.");
      return;
    }
    const data = await call({ acao: "email", documento: cleanDocument(documento) });
    if (!data) return;
    setHint(data.email ?? null);
    setInfo(data.message ?? null);
    setStep("email");
  };

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setError("Informe o e-mail completo do cadastro.");
      return;
    }
    const data = await call({ acao: "codigo", documento: cleanDocument(documento), email: email.trim() });
    if (!data) return;
    setInfo(data.message ?? "Enviamos um código para o seu e-mail.");
    setStep("codigo");
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = !codigo.trim() ? "Informe o código que chegou no seu e-mail." : passwordProblem();
    if (problem) {
      setError(problem);
      return;
    }
    const data = await call({ acao: "senha", documento: cleanDocument(documento), email: email.trim(), codigo: codigo.trim(), senha });
    if (!data) return;
    setInfo(data.message ?? "Senha alterada.");
    setStep("pronto");
  };

  const submitToken = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = !isValidEmail(email) ? "Informe o e-mail do cadastro." : passwordProblem();
    if (problem) {
      setError(problem);
      return;
    }
    const data = await call({ acao: "token", email: email.trim(), token, senha });
    if (!data) return;
    setInfo(data.message ?? "Senha alterada.");
    setStep("pronto");
  };

  if (step === "pronto") {
    return (
      <div className="space-y-5">
        <FormAlert tone="success">{info ?? "Senha alterada."}</FormAlert>
        <Button href={`/conta/entrar${back}`} variant="buy" size="md" block>
          Entrar com a nova senha
        </Button>
      </div>
    );
  }

  const passwordFields = (
    <>
      <PasswordField label="Nova senha" value={senha} onChange={setSenha} show={show} autoComplete="new-password" hint={PASSWORD_HINT} />
      <PasswordField label="Confirme a nova senha" value={confirmacao} onChange={setConfirmacao} show={show} onToggle={setShow} autoComplete="new-password" />
    </>
  );

  return (
    <div className="space-y-5">
      {info && <FormAlert tone="info">{info}</FormAlert>}

      {step === "documento" && (
        <form onSubmit={submitDocument} noValidate className="space-y-4">
          <p className="text-sm text-muted">Informe o CPF ou CNPJ do cadastro. Mostramos o e-mail cadastrado (em parte) para você confirmar.</p>
          <TextField label="CPF ou CNPJ" value={documento} onChange={(value) => setDocumento(formatDocument(value))} autoComplete="off" required />
          {error && <FormAlert>{error}</FormAlert>}
          <Button type="submit" variant="buy" size="md" block loading={busy}>
            Continuar
          </Button>
        </form>
      )}

      {step === "email" && (
        <form onSubmit={submitEmail} noValidate className="space-y-4">
          <p className="text-sm text-muted">
            {hint ? (
              <>
                O e-mail do cadastro é <strong className="text-ink">{hint}</strong>. Digite-o completo para receber o código.
              </>
            ) : (
              "Digite o e-mail do cadastro para receber o código de recuperação."
            )}
          </p>
          <TextField label="E-mail do cadastro" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" required />
          {error && <FormAlert>{error}</FormAlert>}
          <Button type="submit" variant="buy" size="md" block loading={busy}>
            Enviar código
          </Button>
          <Button variant="link" size="sm" onClick={() => setStep("documento")}>
            Trocar o documento
          </Button>
        </form>
      )}

      {step === "codigo" && (
        <form onSubmit={submitCode} noValidate className="space-y-4">
          <TextField label="Código recebido por e-mail" value={codigo} onChange={setCodigo} autoComplete="one-time-code" inputMode="text" required />
          {passwordFields}
          {error && <FormAlert>{error}</FormAlert>}
          <Button type="submit" variant="buy" size="md" block loading={busy}>
            Salvar nova senha
          </Button>
          <Button variant="link" size="sm" onClick={() => setStep("email")}>
            Não recebi o código
          </Button>
        </form>
      )}

      {step === "token" && (
        <form onSubmit={submitToken} noValidate className="space-y-4">
          <p className="text-sm text-muted">Defina a nova senha da sua conta.</p>
          <TextField label="E-mail do cadastro" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" required />
          {passwordFields}
          {error && <FormAlert>{error}</FormAlert>}
          <Button type="submit" variant="buy" size="md" block loading={busy}>
            Salvar nova senha
          </Button>
          <Link href={`/conta/recuperar${back}`} className="block text-sm font-semibold underline underline-offset-4">
            O link expirou? Peça um novo código
          </Link>
        </form>
      )}
    </div>
  );
}
