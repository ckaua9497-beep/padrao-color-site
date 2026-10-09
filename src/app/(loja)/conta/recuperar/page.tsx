import type { Metadata } from "next";
import { AuthShell } from "@/components/account/AccountShell";
import { RecoverFlow } from "@/components/account/RecoverFlow";
import { safeReturnPath } from "@/lib/api/validation";

export const metadata: Metadata = { title: "Recuperar acesso", robots: { index: false, follow: false } };

type Search = Record<string, string | string[] | undefined>;

export default async function RecoverPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  // Link do e-mail de recuperação: /conta/recuperar?token=…&email=…
  const token = typeof params.token === "string" ? params.token.slice(0, 600) : "";
  const email = typeof params.email === "string" ? params.email.slice(0, 120) : "";
  // Veio do checkout (ou de outra página com volta): depois da nova senha, o login devolve para lá.
  const returnTo = safeReturnPath(typeof params.volta === "string" ? params.volta : null, "/conta");

  return (
    <AuthShell title="Recuperar acesso" subtitle={token ? "Defina uma nova senha para a sua conta." : "Confirme seus dados e receba um código para criar uma nova senha."} crumb="Recuperar acesso">
      <RecoverFlow key={token ? "token" : "documento"} token={token} email={email} returnTo={returnTo} />
    </AuthShell>
  );
}
