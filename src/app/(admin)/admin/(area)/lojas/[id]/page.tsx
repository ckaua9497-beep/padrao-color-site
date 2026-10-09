import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminStoreRow from "@/components/admin/AdminStoreRow";
import AnalyticsFilters, { parseAnalyticsSearch } from "@/components/admin/AnalyticsFilters";
import { AnalyticsSections } from "@/components/admin/AnalyticsSections";
import { Empty, KpiStrip, PageHeader, Sheet, Tag } from "@/components/admin/ui";
import StatusBadge from "@/components/painel/StatusBadge";
import { IconExternal } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { releaseDays } from "@/lib/multiloja/config";
import { LOJISTA_TYPE_LABEL, PLAN_INFO, balanceOf, formatDateTime, plural, sqlDaysAgo } from "@/lib/multiloja/core";
import { countLojaProdutos, getLoja, getLojista } from "@/lib/multiloja/repo";
import { listComissoes, listPedidos, listSaques, salesSummary } from "@/lib/multiloja/repo-vendas";
import { lojaUrl } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Loja" };

/** Raio-x de uma multiloja: vendas, saldo do lojista, controles da loja, últimos pedidos e as análises só dela. */
export default async function AdminLoja(props: PageProps<"/admin/lojas/[id]">) {
  const { id } = await props.params;
  const loja = /^\d+$/.test(id) ? await getLoja(Number(id)) : null;
  if (!loja) notFound();
  const lojista = await getLojista(loja.lojistaId);
  const { dias, desde } = parseAnalyticsSearch(await props.searchParams);
  const vendas = await salesSummary(loja.id, sqlDaysAgo(dias));
  const saldo = balanceOf(await listComissoes(loja.id), await listSaques(loja.id), releaseDays());
  const pedidos = await listPedidos({ lojaId: loja.id, limite: 8 });
  const produtos = await countLojaProdutos(loja.id);
  const url = await lojaUrl(loja);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/lojas", label: "Lojas" }}
        title={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {loja.nome}
            <span className="inline-flex gap-1 align-middle">
              {loja.ativa ? <Tag tone="ok">No ar</Tag> : <Tag>Fora do ar</Tag>}
              {lojista?.status === "bloqueado" && <Tag tone="warn">Acesso bloqueado</Tag>}
            </span>
          </span>
        }
        description={
          <>
            {lojista ? `${lojista.nome} · ${LOJISTA_TYPE_LABEL[lojista.tipo] ?? lojista.tipo} · ${lojista.email}` : ""}
            <span className="block">
              Plano {PLAN_INFO[loja.plano].name} · {plural(produtos, "produto ativo", "produtos ativos")} · desde {formatDateTime(loja.criadoEm, false)}
            </span>
          </>
        }
        actions={
          <Button href={url} target="_blank" rel="noreferrer" variant="outline" size="sm" iconEnd={<IconExternal className="size-4" />}>
            {url.replace(/^https?:\/\//, "")}
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <KpiStrip
            cols={4}
            items={[
              { label: `Faturamento (${dias} dias)`, value: formatBRL(vendas.faturamento), hint: `${plural(vendas.pagos, "venda paga", "vendas pagas")} de ${plural(vendas.pedidos, "pedido", "pedidos")}`, hero: true },
              { label: "Comissão do lojista", value: formatBRL(vendas.comissao) },
              { label: "Saldo para saque", value: formatBRL(saldo.available), hint: `a liberar ${formatBRL(saldo.pending)} · sacado ${formatBRL(saldo.withdrawn)}` },
            ]}
          />

          <Sheet
            flush
            title="Últimos pedidos"
            id="ultimos"
            actions={
              <Link href={`/admin/pedidos?loja=${loja.id}`} className="font-semibold underline-offset-4 hover:underline">
                Todos os pedidos
              </Link>
            }
          >
            {pedidos.length === 0 ? (
              <Empty>Nenhum pedido ainda.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {pedidos.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/pedidos/${p.codigo}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-page-checkout sm:grid-cols-[110px_1fr_auto_190px]">
                      <span className="text-[14px] font-bold">{p.codigo}</span>
                      <span className="order-3 col-span-2 min-w-0 truncate text-[13px] text-muted sm:order-none sm:col-span-1">
                        {p.cliente.nome} · {formatDateTime(p.criadoEm)}
                      </span>
                      <span className="text-right text-[14px] font-bold tabular-nums">{formatBRL(p.total)}</span>
                      <span className="order-4 col-span-2 sm:order-none sm:col-span-1 sm:text-right">
                        <StatusBadge status={p.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Sheet>
        </div>

        <Sheet title="Loja e acesso" description="As mudanças valem na hora." id="controles">
          <AdminStoreRow lojaId={loja.id} lojistaId={loja.lojistaId} plano={loja.plano} ativa={loja.ativa} bloqueado={lojista?.status === "bloqueado"} dominio={loja.dominio} dominioVerificado={loja.dominioVerificado} />
        </Sheet>
      </div>

      <div className="space-y-6 border-t border-line pt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-black tracking-[-0.01em]">Movimento da loja</h2>
            <p className="text-[14px] text-muted">Visitas, funil e produtos só desta loja.</p>
          </div>
          <AnalyticsFilters action={`/admin/lojas/${loja.id}`} dias={dias} canal={String(loja.id)} lojas={[]} showCanal={false} />
        </div>
        <AnalyticsSections scope={loja.id} desde={desde} showChannels={false} />
      </div>
    </div>
  );
}
