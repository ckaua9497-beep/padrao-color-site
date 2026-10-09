import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminLoginForm from "@/components/admin/AdminLoginForm";
import AuthShell from "@/components/painel/AuthShell";
import { getAdminSession } from "@/lib/multiloja/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function AdminEntrar() {
  if (await getAdminSession()) redirect("/admin");
  return (
    <AuthShell title="Admin da multiloja" subtitle="Acesso da equipe Padrão Color: pedidos, lojas e saques.">
      <AdminLoginForm />
    </AuthShell>
  );
}
