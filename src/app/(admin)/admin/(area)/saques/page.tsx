import type { Metadata } from "next";
import Link from "next/link";
import AdminWithdrawal from "@/components/admin/AdminWithdrawal";
import { Empty, PageHeader, Sheet, Tag, table } from "@/components/admin/ui";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import { formatDateTime, plural } from "@/lib/multiloja/core";
import { listSaques } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Saques" };

const LABEL = { solicitado: "Solicitado", pago: "Pago", recusado: "Recusado" } as const;

export default async function AdminSaques() {
  const saques = await listSaques(null);
  const pendentes = saques.filter((s) => s.status === "solicitado");
  const resolvidos = saques.filter((s) => s.status !== "solicitado");
  const totalPendente = pendentes.reduce((s, x) => s + x.valor, 0);

  return (
    <div className="space-y-6">
      <PageHeader group="Operação" title="Saques" description="Faça o Pix para a chave do lojista e marque como pago. O valor já saiu do saldo dele quando ele pediu." />

      <Sheet
        flush
        title="Para pagar"
        description={pendentes.length ? `${plural(pendentes.length, "saque", "saques")} · ${formatBRL(totalPendente)} no total` : undefined}
        id="pendentes"
      >
        {pendentes.length === 0 ? (
          <Empty>Nenhum saque esperando pagamento.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {pendentes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[24px] font-extrabold leading-none tracking-[-0.01em] tabular-nums">{formatBRL(s.valor)}</p>
                  <p className="mt-1.5 text-[14px]">
                    <Link href={`/admin/lojas/${s.lojaId}`} className="font-semibold underline-offset-4 hover:underline">
                      {s.lojaNome}
                    </Link>{" "}
                    · chave Pix <code className="select-all break-all rounded-thumb bg-mist px-1.5 py-0.5 text-[13px] font-semibold">{s.chavePix}</code>
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">Pedido em {formatDateTime(s.criadoEm)}</p>
                </div>
                <AdminWithdrawal id={s.id} />
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet flush title="Histórico" id="historico-saques">
        {resolvidos.length === 0 ? (
          <Empty>Nenhum saque resolvido ainda.</Empty>
        ) : (
          <div className={table.wrap}>
            <table className={cx(table.table, "min-w-[640px]")}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Loja</th>
                  <th className={cx(table.th, "text-right")}>Valor</th>
                  <th className={table.th}>Situação</th>
                  <th className={table.th}>Nota</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {resolvidos.map((s) => (
                  <tr key={s.id} className={table.row}>
                    <td className={table.td}>
                      <span className="font-semibold">{s.lojaNome}</span>
                      <span className="block text-[12px] text-muted">pedido em {formatDateTime(s.criadoEm, false)}</span>
                    </td>
                    <td className={cx(table.num, "font-bold")}>{formatBRL(s.valor)}</td>
                    <td className={table.td}>
                      <Tag tone={s.status === "pago" ? "ok" : "warn"}>{LABEL[s.status]}</Tag>
                      {s.resolvidoEm && <span className="ml-2 text-[12px] text-muted">{formatDateTime(s.resolvidoEm, false)}</span>}
                    </td>
                    <td className={cx(table.td, "text-muted")}>{s.nota || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    </div>
  );
}
