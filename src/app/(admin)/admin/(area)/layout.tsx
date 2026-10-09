import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/multiloja/auth";
import { listSaques } from "@/lib/multiloja/repo-vendas";

export default async function AdminAreaLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const pending = listSaques(null).filter((s) => s.status === "solicitado").length;
  return (
    <>
      <AdminNav name={admin.nome} pendingWithdrawals={pending} />
      <main id="conteudo" className="container-site flex-1 py-8">
        {children}
      </main>
    </>
  );
}
