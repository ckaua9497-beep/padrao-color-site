import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthShell from "@/components/painel/AuthShell";
import LoginForm from "@/components/painel/LoginForm";
import { getPainel } from "@/lib/multiloja/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function PainelEntrar() {
  if (await getPainel()) redirect("/painel");
  return (
    <AuthShell title="Painel do lojista" subtitle="Entre para cuidar da sua loja: produtos, margens, aparência e divulgação.">
      <LoginForm />
    </AuthShell>
  );
}
