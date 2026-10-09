import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/multiloja/auth";
import { activeGateway } from "@/lib/multiloja/payments";
import { countPedidosByStatus, listLojasAdmin, listSaques } from "@/lib/multiloja/repo-vendas";

export default async function AdminAreaLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const gateway = await activeGateway();
  const counts = {
    produzir: (await countPedidosByStatus()).pago ?? 0,
    saques: (await listSaques(null)).filter((s) => s.status === "solicitado").length,
    lojas: (await listLojasAdmin()).length,
  };
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <AdminNav
        name={admin.nome}
        counts={counts}
        gateway={{ label: gateway ? (gateway.name === "simulado" ? "simulação" : gateway.label) : "desligado", live: Boolean(gateway && gateway.name !== "simulado") }}
      />
      <main id="conteudo" className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">
        <div className="mx-auto max-w-[1240px]">{children}</div>
      </main>
    </div>
  );
}
