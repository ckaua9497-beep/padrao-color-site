"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { setCustomer } from "@/lib/customer";
import { postJson } from "./client-api";
import { FormAlert } from "./FormBits";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";

/** /conta/entrar: entra e volta para onde estava (o caminho já vem validado do servidor). */
export function LoginPanel({ returnTo, defaultUser }: { returnTo: string; defaultUser?: string }) {
  const router = useRouter();
  return (
    <LoginForm
      defaultUser={defaultUser}
      signupHref={`/conta/cadastro?volta=${encodeURIComponent(returnTo)}`}
      onSuccess={() => {
        router.replace(returnTo);
        router.refresh();
      }}
    />
  );
}

/** /conta/cadastro: cria a conta; com login automático segue para a volta, senão pede para entrar. */
export function SignupPanel({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);
  if (done) {
    return (
      <div className="space-y-5">
        <FormAlert tone="success">{done}</FormAlert>
        <Button href={`/conta/entrar?volta=${encodeURIComponent(returnTo)}`} variant="buy" size="md" block>
          Entrar
        </Button>
      </div>
    );
  }
  return (
    <SignupForm
      onSuccess={({ loggedIn, message }) => {
        if (!loggedIn) {
          setDone(message ?? "Conta criada! Entre com seu CPF/CNPJ ou e-mail e a senha.");
          return;
        }
        router.replace(returnTo);
        router.refresh();
      }}
    />
  );
}

/** Sair: apaga a sessão no servidor e volta para a loja. */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logout = async () => {
    setBusy(true);
    const reply = await postJson("/api/conta/logout", {});
    setBusy(false);
    if (!reply.ok) {
      setError(reply.error);
      return;
    }
    setCustomer({ status: "anonymous" });
    router.replace("/");
    router.refresh();
  };
  return (
    <div className={className}>
      <Button variant="outline" size="sm" onClick={logout} loading={busy}>
        Sair da conta
      </Button>
      {error && <FormAlert className="mt-2">{error}</FormAlert>}
    </div>
  );
}

/** Abas da área logada. */
export function AccountNav({ current }: { current: "conta" | "pedidos" }) {
  const tabs = [
    { id: "conta", href: "/conta", label: "Minha conta" },
    { id: "pedidos", href: "/conta/pedidos", label: "Meus pedidos" },
  ] as const;
  return (
    <nav aria-label="Área do cliente" className="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-card">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === current ? "page" : undefined}
          className={tab.id === current ? "rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white" : "rounded-full px-4 py-2 text-sm font-semibold text-ink/70 transition-colors hover:text-ink"}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
