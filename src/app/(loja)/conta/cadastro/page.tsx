import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupPanel } from "@/components/account/AuthPanels";
import { AuthShell } from "@/components/account/AccountShell";
import { safeReturnPath } from "@/lib/api/validation";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Criar conta", robots: { index: false, follow: false } };

type Search = Record<string, string | string[] | undefined>;

export default async function SignupPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const returnTo = safeReturnPath(typeof params.volta === "string" ? params.volta : null, "/conta");
  if (await getSession()) redirect(returnTo);

  return (
    <AuthShell title="Criar conta" subtitle="Cadastro de pessoa física ou jurídica. Leva menos de 2 minutos." crumb="Criar conta" wide>
      <p className="-mt-2 mb-6 text-sm text-muted">
        Já tem conta?{" "}
        <Link href={`/conta/entrar?volta=${encodeURIComponent(returnTo)}`} className="font-semibold text-ink underline underline-offset-4">
          Entrar
        </Link>
      </p>
      <SignupPanel returnTo={returnTo} />
    </AuthShell>
  );
}
