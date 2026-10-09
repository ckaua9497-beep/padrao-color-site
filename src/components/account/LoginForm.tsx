"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { setCustomer } from "@/lib/customer";
import { postJson } from "./client-api";
import { FormAlert, PasswordField } from "./FormBits";

type Props = {
  /** Depois de entrar (a sessão já está no cookie e o cliente atualizado). */
  onSuccess?: () => void;
  defaultUser?: string;
  /** Link "Criar conta"; com onSignup vira botão (checkout troca a aba). */
  onSignup?: () => void;
  signupHref?: string;
  /** "Esqueci minha senha" (com a volta, para o cliente retornar ao checkout depois de trocar a senha). */
  recoverHref?: string;
};

/** Login: documento, e-mail ou usuário + senha → POST /api/conta/login. */
export function LoginForm({ onSuccess, defaultUser = "", onSignup, signupHref = "/conta/cadastro", recoverHref = "/conta/recuperar" }: Props) {
  const [usuario, setUsuario] = useState(defaultUser);
  const [senha, setSenha] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!usuario.trim() || !senha) {
      setError("Informe o usuário e a senha.");
      return;
    }
    setBusy(true);
    setError(null);
    const reply = await postJson<{ customer: unknown }>("/api/conta/login", { usuario, senha });
    if (!reply.ok) {
      setBusy(false);
      setError(reply.error);
      return;
    }
    setSenha("");
    setCustomer(reply.data.customer);
    // Com onSuccess a página navega (a conta leva alguns segundos para abrir): o botão segue carregando até sair.
    if (onSuccess) onSuccess();
    else setBusy(false);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label="CPF/CNPJ, e-mail ou usuário"
        value={usuario}
        onChange={setUsuario}
        name="usuario"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      <PasswordField label="Senha" value={senha} onChange={setSenha} show={show} onToggle={setShow} autoComplete="current-password" />
      {error && <FormAlert>{error}</FormAlert>}
      <Button type="submit" variant="buy" size="md" block loading={busy}>
        Entrar
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={recoverHref} className="font-semibold underline underline-offset-4">
          Esqueci minha senha
        </Link>
        {onSignup ? (
          <Button variant="link" size="sm" onClick={onSignup} className="font-semibold">
            Criar conta
          </Button>
        ) : (
          <Link href={signupHref} className="font-semibold underline underline-offset-4">
            Criar conta
          </Link>
        )}
      </div>
    </form>
  );
}
