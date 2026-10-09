import type { Metadata } from "next";
import Link from "next/link";
import FinanceiroForms from "@/components/painel/FinanceiroForms";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import { requirePainel } from "@/lib/multiloja/auth";
import { balanceOf, commissionReleased, formatDateTime } from "@/lib/multiloja/core";
import { paymentRates, releaseDays } from "@/lib/multiloja/config";
import { listComissoes, listPedidos, listSaques } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Financeiro" };

const SAQUE_LABEL = { solicitado: "Solicitado", pago: "Pago", recusado: "Recusado" } as const;

export default async function PainelFinanceiro() {
  const { lojista, loja } = await requirePainel();
  const days = releaseDays();
  const saques = listSaques(loja.id);
  const balance = balanceOf(listComissoes(loja.id), saques, days);
  const vendas = listPedidos({ lojaId: loja.id, limite: 100 }).filter((p) => p.pagoEm && p.status !== "cancelado");
  const rates = paymentRates();

  const cards = [
    { label: "Disponível para saque", value: balance.available, tone: "bg-ink text-white" },
    { label: "A liberar", value: balance.pending, hint: `Libera na entrega ou ${days} dias após o pagamento` },
    { label: "Em saque", value: balance.requested, hint: "Pedidos de saque em andamento" },
    { label: "Já recebido", value: balance.withdrawn },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">Financeiro</h1>
        <p className="mt-1 max-w-3xl text-muted">
          A Padrão Color recebe o pagamento do cliente, desconta o custo dos produtos, o frete e a taxa do pagamento (Pix {rates.pix.toLocaleString("pt-BR")}%, cartão {rates.cartao.toLocaleString("pt-BR")}%), e o restante é a sua comissão.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={cx("rounded-panel p-4 shadow-card", c.tone ?? "bg-white")}>
            <p className={cx("text-caption font-semibold", c.tone ? "text-white/75" : "text-muted")}>{c.label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{formatBRL(c.value)}</p>
            {c.hint && <p className="mt-1 text-caption leading-tight text-muted">{c.hint}</p>}
          </div>
        ))}
      </div>

      <FinanceiroForms chavePix={lojista.chavePix} available={balance.available} />

      <section className="rounded-panel bg-white p-5 shadow-card" aria-labelledby="comissoes">
        <h2 id="comissoes" className="text-lg font-bold">
          Comissões
        </h2>
        {vendas.length === 0 ? (
          <p className="mt-3 text-muted">Nenhuma venda paga ainda.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead className="border-b border-line text-caption text-muted">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Pedido</th>
                  <th className="py-2 pr-4 font-semibold">Pago em</th>
                  <th className="py-2 pr-4 text-right font-semibold">Venda</th>
                  <th className="py-2 pr-4 text-right font-semibold">Comissão</th>
                  <th className="py-2 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {vendas.map((p) => {
                  const released = commissionReleased(p, days);
                  return (
                    <tr key={p.id}>
                      <td className="py-2 pr-4">
                        <Link href={`/painel/vendas/${p.codigo}`} className="font-bold underline-offset-4 hover:underline">
                          {p.codigo}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-muted">{p.pagoEm ? formatDateTime(p.pagoEm, false) : "—"}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatBRL(p.total)}</td>
                      <td className="py-2 pr-4 text-right font-bold tabular-nums">{formatBRL(p.comissao)}</td>
                      <td className="py-2">{released ? "Liberada" : "A liberar"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-panel bg-white p-5 shadow-card" aria-labelledby="saques">
        <h2 id="saques" className="text-lg font-bold">
          Saques
        </h2>
        {saques.length === 0 ? (
          <p className="mt-3 text-muted">Nenhum saque pedido.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {saques.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-[15px]">
                <span className="tabular-nums text-muted">{formatDateTime(s.criadoEm)}</span>
                <span className="font-bold tabular-nums">{formatBRL(s.valor)}</span>
                <span>
                  {SAQUE_LABEL[s.status]}
                  {s.nota ? ` · ${s.nota}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
