import type { Metadata } from "next";
import AdminWithdrawal from "@/components/admin/AdminWithdrawal";
import { formatBRL } from "@/lib/format";
import { formatDateTime } from "@/lib/multiloja/core";
import { listSaques } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Saques" };

const LABEL = { solicitado: "Solicitado", pago: "Pago", recusado: "Recusado" } as const;

export default async function AdminSaques() {
  const saques = listSaques(null);
  const pendentes = saques.filter((s) => s.status === "solicitado");
  const resolvidos = saques.filter((s) => s.status !== "solicitado");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">Saques</h1>
        <p className="mt-1 text-muted">Faça o Pix para a chave do lojista e marque como pago. O sistema já descontou o valor do saldo dele.</p>
      </div>

      <section className="space-y-3" aria-labelledby="pendentes">
        <h2 id="pendentes" className="text-xl font-bold">
          Para pagar ({pendentes.length})
        </h2>
        {pendentes.length === 0 ? (
          <p className="rounded-panel bg-white p-6 text-muted shadow-card">Nenhum saque pendente.</p>
        ) : (
          <ul className="space-y-3">
            {pendentes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-white p-4 shadow-card">
                <div>
                  <p className="text-lg font-black tabular-nums">{formatBRL(s.valor)}</p>
                  <p className="text-[14px]">
                    {s.lojaNome} · chave Pix <strong className="break-all">{s.chavePix}</strong>
                  </p>
                  <p className="text-caption text-muted">Pedido em {formatDateTime(s.criadoEm)}</p>
                </div>
                <AdminWithdrawal id={s.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {resolvidos.length > 0 && (
        <section className="rounded-panel bg-white p-5 shadow-card" aria-labelledby="historico-saques">
          <h2 id="historico-saques" className="text-lg font-bold">
            Histórico
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {resolvidos.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2 text-[14px]">
                <span>{s.lojaNome}</span>
                <span className="font-bold tabular-nums">{formatBRL(s.valor)}</span>
                <span>
                  {LABEL[s.status]}
                  {s.resolvidoEm ? ` em ${formatDateTime(s.resolvidoEm, false)}` : ""}
                  {s.nota ? ` · ${s.nota}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
