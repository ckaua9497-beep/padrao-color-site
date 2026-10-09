import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/account/AuthPanels";
import { AuthShell } from "@/components/account/AccountShell";
import { FormAlert } from "@/components/account/FormBits";
import { safeReturnPath } from "@/lib/api/validation";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

type Search = Record<string, string | string[] | undefined>;

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const returnTo = safeReturnPath(typeof params.volta === "string" ? params.volta : null, "/conta");
  const expired = params.sessao === "expirada";
  // Já logado vai direto. Com "sessão expirada" não: o cookie ainda existe até o GET /api/conta/sessao apagar.
  if (!expired && (await getSession())) redirect(returnTo);

  return (
    <AuthShell title="Entrar" subtitle="Use o CPF/CNPJ, o e-mail ou o usuário da sua conta Padrão Color." crumb="Entrar">
      {expired && (
        <FormAlert tone="info" className="mb-5">
          Sua sessão expirou. Entre de novo para continuar.
        </FormAlert>
      )}
      <LoginPanel returnTo={returnTo} expired={expired} />
    </AuthShell>
  );
}
