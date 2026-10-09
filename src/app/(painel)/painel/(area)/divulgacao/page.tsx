import type { Metadata } from "next";
import { LinkActions, NovoLinkForm } from "@/components/painel/DivulgacaoForms";
import { Panel } from "@/components/painel/fields";
import { formatBRL } from "@/lib/format";
import { requirePainel } from "@/lib/multiloja/auth";
import { dayKeyDaysAgo, plural as count } from "@/lib/multiloja/core";
import { listLinks, refStats, visitsByDay } from "@/lib/multiloja/repo-vendas";
import { lojaUrl } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Divulgação" };

const resumo = (s?: { visitas: number; pagos: number; faturamento: number }) =>
  `${count(s?.visitas ?? 0, "visita", "visitas")} · ${count(s?.pagos ?? 0, "venda paga", "vendas pagas")} · ${formatBRL(s?.faturamento ?? 0)}`;

export default async function PainelDivulgacao() {
  const { loja } = await requirePainel();
  const url = await lojaUrl(loja);
  const since = dayKeyDaysAgo(29);
  const links = listLinks(loja.id);
  const stats = new Map(refStats(loja.id, since).map((s) => [s.ref, s]));
  const days = visitsByDay(loja.id, since);
  const totalVisits = days.reduce((sum, d) => sum + d.visitas, 0);
  const max = Math.max(1, ...days.map((d) => d.visitas));
  const direct = stats.get("");
  const allPaid = [...stats.values()].reduce((sum, s) => sum + s.pagos, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">Divulgação</h1>
        <p className="mt-1 max-w-3xl text-muted">Crie um link para cada lugar onde você divulga (bio, stories, grupo, anúncio) e veja de onde vêm as visitas e as vendas.</p>
      </div>

      <section className="rounded-panel bg-white p-5 shadow-card" aria-labelledby="visitas">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="visitas" className="text-lg font-bold">
            Visitas nos últimos 30 dias
          </h2>
          <p className="text-[15px] text-muted">
            {count(totalVisits, "visita", "visitas")} · {count(allPaid, "venda paga", "vendas pagas")}
            {totalVisits > 0 ? ` · conversão ${((allPaid / totalVisits) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : ""}
          </p>
        </div>
        {days.length === 0 ? (
          <p className="mt-3 text-muted">As visitas aparecem aqui assim que alguém abrir a loja.</p>
        ) : (
          <div className="mt-4 flex h-32 items-end gap-1" role="img" aria-label={`Visitas por dia: ${days.map((d) => `${d.dia.slice(8)}/${d.dia.slice(5, 7)}: ${d.visitas}`).join("; ")}`}>
            {days.map((d) => (
              <div key={d.dia} className="flex flex-1 flex-col items-center justify-end" title={`${d.dia.slice(8)}/${d.dia.slice(5, 7)}: ${d.visitas}`}>
                <div className="w-full max-w-6 rounded-t bg-ink" style={{ height: `${Math.max(4, (d.visitas / max) * 100)}%` }} />
              </div>
            ))}
          </div>
        )}
      </section>

      <Panel title="Novo link de divulgação" id="novo-link">
        <NovoLinkForm storeUrl={url} />
      </Panel>

      <section className="rounded-panel bg-white p-5 shadow-card" aria-labelledby="links">
        <h2 id="links" className="text-lg font-bold">
          Seus links (30 dias)
        </h2>
        <ul className="mt-3 divide-y divide-line">
          {links.map((link) => {
            const s = stats.get(link.slug);
            const full = `${url}/?ref=${link.slug}`;
            return (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-bold">{link.nome}</p>
                  <p className="break-all text-caption text-muted">{full.replace(/^https?:\/\//, "")}</p>
                  <p className="text-caption">{resumo(s)}</p>
                </div>
                <LinkActions id={link.id} url={full} />
              </li>
            );
          })}
          <li className="py-3">
            <p className="font-bold">Acesso direto</p>
            <p className="text-caption">{resumo(direct)} (sem link de divulgação)</p>
          </li>
        </ul>
      </section>
    </div>
  );
}
