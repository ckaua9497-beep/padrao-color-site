import type { Metadata } from "next";
import Link from "next/link";
import { InlineBar, compact } from "@/components/admin/charts";
import { Dot, Empty, KpiStrip, PageHeader, Sheet } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import { channels, kpis, products } from "@/lib/multiloja/analytics";
import { padraoProduction, signupOpen } from "@/lib/multiloja/config";
import { dayKeyDaysAgo, formatDateTime, plural, sqlDaysAgo } from "@/lib/multiloja/core";
import { funnelRates } from "@/lib/multiloja/eventos";
import { paymentSummary } from "@/lib/multiloja/payments";
import { listLojasAdmin, listPedidos, listSaques, salesSummary } from "@/lib/multiloja/repo-vendas";

export const metadata: Metadata = { title: "Visão geral" };

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Fila de trabalho: o número grande é o que falta fazer; zero aparece apagado ("em dia"). */
function QueueCell({ href, label, count, hint }: { href: string; label: string; count: number; hint: string }) {
  return (
    <Link href={href} className="group block min-w-0 bg-white px-3 py-4 transition-colors hover:bg-page-checkout sm:px-5">
      <span className="block text-[12px] font-semibold leading-snug text-muted">{label}</span>
      <span className={cx("mt-1 block text-[28px] font-black leading-none tracking-[-0.02em] tabular-nums sm:text-[36px]", count === 0 && "text-line-strong")}>{count}</span>
      <span className="mt-1.5 block truncate text-[12px] text-muted group-hover:text-ink">{count === 0 ? "em dia" : hint} →</span>
    </Link>
  );
}

export default async function AdminInicio() {
  const desde = dayKeyDaysAgo(29);
  const mes = await salesSummary(null, sqlDaysAgo(30));
  const paraProduzir = await listPedidos({ status: "pago", limite: 50 });
  const saques = (await listSaques(null)).filter((s) => s.status === "solicitado");
  const lojas = await listLojasAdmin();
  const dominios = lojas.filter((l) => l.dominio && !l.dominioVerificado);
  const pagamento = await paymentSummary();
  const production = padraoProduction();
  const rede = await kpis("todas", desde);
  const taxas = funnelRates(rede);
  const canais = (await channels(desde)).slice(0, 6);
  const maxCanal = Math.max(0, ...canais.map((c) => c.valor));
  const top = (await products("todas", desde, 5)).filter((p) => p.receita > 0 || p.carrinhos > 0);
  const maxTop = Math.max(0, ...top.map((p) => p.receita));
  const productionOn = production.enabled && Boolean(production.customerId);
  const signup = await signupOpen();

  return (
    <div className="space-y-6">
      <PageHeader
        group="Operação"
        title="Visão geral"
        description="O que está esperando a equipe e como a rede está indo nos últimos 30 dias (site da Padrão + todas as multilojas)."
        actions={
          <Button href="/admin/analises" variant="outline" size="sm">
            Abrir análises
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Sheet flush title="Para fazer agora" description="Pedidos pagos esperando a produção, saques e domínios." id="fila">
          <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
            <QueueCell href="/admin/pedidos?status=pago" label="Enviar para produção" count={paraProduzir.length} hint="ver pedidos pagos" />
            <QueueCell href="/admin/saques" label="Saques para pagar" count={saques.length} hint={formatBRL(saques.reduce((s, x) => s + x.valor, 0))} />
            <QueueCell href="/admin/lojas" label="Domínios para liberar" count={dominios.length} hint={dominios.map((d) => d.dominio).join(", ")} />
          </div>
          {paraProduzir.length === 0 ? (
            <Empty>Nenhum pedido pago esperando produção.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {paraProduzir.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/pedidos/${p.codigo}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-5 py-3 transition-colors hover:bg-page-checkout sm:grid-cols-[120px_1fr_auto]">
                    <span className="text-[14px] font-bold">{p.codigo}</span>
                    <span className="order-3 col-span-2 min-w-0 truncate text-[13px] text-muted sm:order-none sm:col-span-1">
                      {p.lojaNome} · {p.cliente.nome} · pago {p.pagoEm ? formatDateTime(p.pagoEm) : "—"}
                    </span>
                    <span className="text-right text-[14px] font-bold tabular-nums">{formatBRL(p.total)}</span>
                  </Link>
                </li>
              ))}
              {paraProduzir.length > 6 && (
                <li className="px-5 py-3 text-[13px]">
                  <Link href="/admin/pedidos?status=pago" className="font-semibold underline-offset-4 hover:underline">
                    Ver os {paraProduzir.length} pedidos pagos
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Sheet>

        <Sheet title="Situação" id="situacao">
          <ul className="space-y-3.5 text-[14px]">
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5">
                <Dot tone={pagamento.live ? "ok" : "warn"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-muted">Pagamento online</span>
                <strong className="font-semibold">{pagamento.detail}</strong>
              </span>
              <Link href="/admin/pagamentos" className="text-[13px] font-semibold underline underline-offset-2">
                trocar
              </Link>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5">
                <Dot tone={productionOn ? "ok" : "warn"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-muted">Envio para a produção (API Padrão)</span>
                <strong className="font-semibold">{productionOn ? `Ligado · cliente ${production.customerId}` : "Simulado"}</strong>
                {!productionOn && <span className="block text-[12px] text-muted">Os dados do pedido aparecem, nada vai para a Padrão.</span>}
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5">
                <Dot tone={lojas.some((l) => l.ativa) ? "ok" : "off"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-muted">Lojas</span>
                <strong className="font-semibold">
                  {lojas.filter((l) => l.ativa).length} no ar de {lojas.length}
                </strong>
              </span>
              <Link href="/admin/lojas" className="text-[13px] font-semibold underline underline-offset-2">
                ver
              </Link>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5">
                <Dot tone={signup ? "ok" : "off"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-muted">Cadastro público de lojistas</span>
                <strong className="font-semibold">{signup ? "Aberto" : "Fechado (só por convite)"}</strong>
              </span>
              <Link href="/admin/lojas" className="text-[13px] font-semibold underline underline-offset-2">
                mudar
              </Link>
            </li>
          </ul>
        </Sheet>
      </div>

      <KpiStrip
        items={[
          { label: "Faturamento das lojas (30 dias)", value: formatBRL(mes.faturamento), hint: `${plural(mes.pagos, "venda paga", "vendas pagas")} de ${plural(mes.pedidos, "pedido", "pedidos")}`, hero: true },
          { label: "Comissões dos lojistas", value: formatBRL(mes.comissao) },
          { label: "Visitantes (site + lojas)", value: compact(rede.visitantes), hint: plural(rede.sessoes, "sessão", "sessões") },
          { label: "Pedidos (site + lojas)", value: compact(rede.pedidos), hint: formatBRL(rede.valorPedidos) },
          { label: "Conversão", value: pct(taxas.conversaoPedido), hint: `abandono de carrinho ${pct(taxas.abandonoCarrinho)}` },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Sheet
          flush
          title="Site da Padrão × multilojas"
          description="Valor dos pedidos por canal."
          id="canais"
          actions={
            <Link href="/admin/analises#canais" className="font-semibold underline-offset-4 hover:underline">
              Detalhes
            </Link>
          }
        >
          {canais.length === 0 ? (
            <Empty>Sem visitas nem pedidos no período.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {canais.map((c) => (
                <li key={c.lojaId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3 text-[14px]">
                  <span className="min-w-0 truncate font-semibold">
                    {c.lojaId === 0 ? (
                      c.nome
                    ) : (
                      <Link href={`/admin/lojas/${c.lojaId}`} className="underline-offset-4 hover:underline">
                        {c.nome}
                      </Link>
                    )}
                  </span>
                  <span className="text-right tabular-nums">
                    <strong>{formatBRL(c.valor)}</strong>
                  </span>
                  <span className="col-span-2 flex items-center gap-3">
                    <span className="flex-1">
                      <InlineBar value={c.valor} max={maxCanal} />
                    </span>
                    <span className="whitespace-nowrap text-[12px] text-muted">
                      {plural(c.pedidos, "pedido", "pedidos")} · {plural(c.visitantes, "visitante", "visitantes")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Sheet>

        <Sheet
          flush
          title="Produtos vencedores"
          description="Maior receita na rede (site + lojas)."
          id="vencedores"
          actions={
            <Link href="/admin/analises#produtos" className="font-semibold underline-offset-4 hover:underline">
              Ranking completo
            </Link>
          }
        >
          {top.length === 0 ? (
            <Empty>Sem vendas no período.</Empty>
          ) : (
            <ol className="divide-y divide-line">
              {top.map((p, i) => (
                <li key={p.produtoId} className="grid grid-cols-[24px_1fr_auto] items-center gap-x-3 gap-y-1.5 px-5 py-3 text-[14px]">
                  <span className="text-[13px] font-bold tabular-nums text-muted">{i + 1}</span>
                  <span className="min-w-0 truncate font-semibold">{p.nome}</span>
                  <span className="text-right font-bold tabular-nums">{formatBRL(p.receita)}</span>
                  <span />
                  <span className="col-span-2 flex items-center gap-3">
                    <span className="flex-1">
                      <InlineBar value={p.receita} max={maxTop} />
                    </span>
                    <span className="whitespace-nowrap text-[12px] text-muted">
                      {plural(p.pedidos, "pedido", "pedidos")}
                      {p.lojas > 0 && ` · ${plural(p.lojas, "loja", "lojas")}`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Sheet>
      </div>
    </div>
  );
}
