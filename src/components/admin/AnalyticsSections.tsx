import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { abandonedCarts, byDay, byHour, channels, kpis, products, sources, type Scope } from "@/lib/multiloja/analytics";
import { formatDateTime } from "@/lib/multiloja/core";
import { funnelRates } from "@/lib/multiloja/eventos";
import { ColumnChart, FunnelChart, InlineBar, compact } from "./charts";
import { KpiStrip } from "./ui";

/*
 * Seções de análise (rastreamento anônimo): números gerais, funil, fluxo de pessoas e de vendas, canais, produtos
 * vencedores, abandono de carrinho, origens e aparelhos. `scope` escolhe site, multilojas, todas ou uma loja.
 */

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const shortDay = (dia: string) => `${dia.slice(8)}/${dia.slice(5, 7)}`;

export function Section({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-6 space-y-3">
      <div>
        <h2 id={id} className="text-[18px] font-bold tracking-[-0.01em]">
          {title}
        </h2>
        {description && <p className="text-[13px] text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export async function AnalyticsSections({ scope, desde, showChannels = true }: { scope: Scope; desde: string; showChannels?: boolean }) {
  const k = await kpis(scope, desde);
  const rates = funnelRates(k);
  const days = await byDay(scope, desde);
  const hours = await byHour(scope, desde);
  const prods = await products(scope, desde, 30);
  const carts = await abandonedCarts(scope, desde, 25);
  const src = await sources(scope, desde);
  const chans = showChannels ? (await channels(desde)).filter((c) => scope === "todas" || (scope === "site" ? c.lojaId === 0 : scope === "multilojas" ? c.lojaId > 0 : c.lojaId === scope)) : [];
  const maxChannel = Math.max(0, ...chans.map((c) => c.valor));
  const maxProduct = Math.max(0, ...prods.map((p) => p.receita));
  const totalSessions = Math.max(1, src.dispositivos.reduce((s, d) => s + d.sessoes, 0));
  const refSessions = Math.max(1, src.refs.reduce((s, r) => s + r.sessoes, 0));

  return (
    <div className="space-y-8">
      <KpiStrip
        cols={4}
        items={[
          { label: "Visitantes", value: compact(k.visitantes), hint: `${compact(k.sessoes)} sessões · ${compact(k.paginas)} páginas` },
          { label: "Pedidos", value: compact(k.pedidos), hint: `${formatBRL(k.valorPedidos)} · ticket ${formatBRL(k.ticketMedio)}` },
          { label: "Conversão (sessão → pedido)", value: pct(rates.conversaoPedido), hint: `pagos: ${compact(k.pagos)} (${formatBRL(k.valorPago)})` },
          { label: "Abandono de carrinho", value: pct(rates.abandonoCarrinho), hint: `checkout abandonado: ${pct(rates.abandonoCheckout)}` },
        ]}
      />

      <Section id="funil" title="Funil de vendas" description="Quantas sessões chegaram a cada etapa.">
        <div className="rounded-card bg-white p-5 shadow-sheet">
          <FunnelChart
            steps={[
              { label: "Sessões", value: k.sessoes },
              { label: "Viram um produto", value: k.produto, rate: pct(rates.verProduto) },
              { label: "Puseram no carrinho", value: k.carrinho, rate: pct(rates.carrinho) },
              { label: "Abriram o checkout", value: k.checkout, rate: pct(rates.checkout) },
              { label: "Fizeram o pedido", value: k.pedido, rate: pct(rates.pedido) },
              { label: "Pagaram (multilojas)", value: k.pago, rate: pct(rates.pago) },
            ]}
          />
          <p className="mt-4 text-caption text-muted">No site da Padrão, o pagamento é confirmado no sistema da Padrão; aqui entram só os pedidos feitos.</p>
        </div>
      </Section>

      <Section id="fluxo" title="Fluxo de pessoas e de vendas">
        <div className="grid gap-4 lg:grid-cols-2">
          <ColumnChart title="Visitantes por dia" points={days.map((d) => ({ label: shortDay(d.dia), tick: shortDay(d.dia), value: d.visitantes, display: d.visitantes.toLocaleString("pt-BR") }))} />
          <ColumnChart title="Pedidos por dia" points={days.map((d) => ({ label: shortDay(d.dia), tick: shortDay(d.dia), value: d.pedidos, display: `${d.pedidos} (${formatBRL(d.valor)})` }))} />
          <ColumnChart title="Visitas por hora do dia" caption="horário de Brasília" points={hours.map((h) => ({ label: `${h.hora}h`, tick: h.hora % 3 === 0 ? `${h.hora}h` : "", value: h.visitas, display: h.visitas.toLocaleString("pt-BR") }))} />
          <ColumnChart title="Pedidos por hora do dia" caption="horário de Brasília" points={hours.map((h) => ({ label: `${h.hora}h`, tick: h.hora % 3 === 0 ? `${h.hora}h` : "", value: h.pedidos, display: h.pedidos.toLocaleString("pt-BR") }))} />
        </div>
      </Section>

      {showChannels && chans.length > 0 && (
        <Section id="canais" title="Site da Padrão × multilojas" description="Cada canal lado a lado, ordenado pelo valor dos pedidos.">
          <div className="relative overflow-x-auto rounded-card bg-white shadow-sheet">
            <table className="w-full min-w-[760px] text-left text-[14px]">
              <thead className="border-b border-line text-[12px] text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Canal</th>
                  <th className="px-5 py-3 text-right font-semibold">Visitantes</th>
                  <th className="px-5 py-3 text-right font-semibold">Carrinhos</th>
                  <th className="px-5 py-3 text-right font-semibold">Pedidos</th>
                  <th className="px-5 py-3 text-right font-semibold">Conversão</th>
                  <th className="px-5 py-3 text-right font-semibold">Valor</th>
                  <th className="w-40 px-4 py-3 font-semibold">
                    <span className="sr-only">Proporção</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {chans.map((c) => (
                  <tr key={c.lojaId}>
                    <td className="px-5 py-2.5 font-semibold">{c.lojaId === 0 ? c.nome : <Link href={`/admin/lojas/${c.lojaId}`} className="underline-offset-4 hover:underline">{c.nome}</Link>}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{c.visitantes.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{c.carrinho.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{c.pedidos.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{pct(c.sessoes ? Math.min(100, (c.sessoesPedido / c.sessoes) * 100) : 0)}</td>
                    <td className="px-5 py-2.5 text-right font-bold tabular-nums">{formatBRL(c.valor)}</td>
                    <td className="px-5 py-2.5">
                      <InlineBar value={c.valor} max={maxChannel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section id="produtos" title="Produtos vencedores" description="Vistos → carrinho → vendidos, com a receita no site da Padrão e nas multilojas.">
        {prods.length === 0 ? (
          <p className="rounded-card bg-white p-6 text-center text-[14px] text-muted shadow-sheet">Sem movimento de produtos no período.</p>
        ) : (
          <div className="relative overflow-x-auto rounded-card bg-white shadow-sheet">
            <table className="w-full min-w-[900px] text-left text-[14px]">
              <thead className="border-b border-line text-[12px] text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">#</th>
                  <th className="px-5 py-3 font-semibold">Produto</th>
                  <th className="px-5 py-3 text-right font-semibold">Vistas</th>
                  <th className="px-5 py-3 text-right font-semibold">Carrinhos</th>
                  <th className="px-5 py-3 text-right font-semibold">Pedidos</th>
                  <th className="px-5 py-3 text-right font-semibold">Vista → pedido</th>
                  <th className="px-5 py-3 text-right font-semibold">Receita site</th>
                  <th className="px-5 py-3 text-right font-semibold">Receita lojas</th>
                  <th className="w-36 px-4 py-3 font-semibold">
                    <span className="sr-only">Proporção</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {prods.map((p, i) => (
                  <tr key={p.produtoId}>
                    <td className="px-5 py-2.5 tabular-nums text-muted">{i + 1}</td>
                    <td className="px-5 py-2.5">
                      <span className="font-semibold">{p.nome}</span>
                      <span className="block text-caption text-muted">
                        {p.categoria}
                        {p.lojas > 0 && ` · vendido em ${p.lojas} ${p.lojas === 1 ? "loja" : "lojas"}`}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{p.views.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{p.carrinhos.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{p.pedidos.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{p.views ? pct(Math.min(100, (p.compradores / p.views) * 100)) : "—"}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{formatBRL(p.receitaSite)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{formatBRL(p.receitaLojas)}</td>
                    <td className="px-5 py-2.5">
                      <InlineBar value={p.receita} max={maxProduct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="abandono" title="Carrinhos abandonados" description="Sessões com produto no carrinho, sem pedido, paradas há mais de 30 minutos. Anônimas: sem contato do cliente.">
        {carts.length === 0 ? (
          <p className="rounded-card bg-white p-6 text-center text-[14px] text-muted shadow-sheet">Nenhum carrinho abandonado no período.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card bg-white px-5 shadow-sheet">
            {carts.map((c) => (
              <li key={`${c.lojaId}-${c.sessao}`} className="flex flex-wrap items-start justify-between gap-3 py-3 text-[14px]">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {c.loja} <span className="font-normal text-muted">· {formatDateTime(c.ultimo)} · {c.dispositivo}</span>
                  </p>
                  <p className="text-muted">{c.itens.length ? c.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ") : "itens removidos depois"}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums">{formatBRL(c.valor)}</p>
                  <p className="text-caption text-muted">{c.chegouCheckout ? "parou no checkout" : "parou no carrinho"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="origens" title="Origens e aparelhos">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-card bg-white p-5 shadow-sheet">
            <p className="text-[15px] font-bold">De onde vêm as sessões</p>
            <ul className="mt-3 space-y-2 text-[14px]">
              {src.refs.length === 0 && <li className="text-muted">Sem visitas no período.</li>}
              {src.refs.map((r) => (
                <li key={r.ref} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <span>{r.ref ? `Link “${r.ref}”` : "Acesso direto / busca"}</span>
                  <span className="tabular-nums text-muted">
                    {r.sessoes.toLocaleString("pt-BR")} ({pct((r.sessoes / refSessions) * 100)})
                  </span>
                  <span className="col-span-2">
                    <InlineBar value={r.sessoes} max={refSessions} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-card bg-white p-5 shadow-sheet">
            <p className="text-[15px] font-bold">Aparelhos</p>
            <ul className="mt-3 space-y-2 text-[14px]">
              {src.dispositivos.length === 0 && <li className="text-muted">Sem visitas no período.</li>}
              {src.dispositivos.map((d) => (
                <li key={d.dispositivo} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <span className="capitalize">{d.dispositivo}</span>
                  <span className="tabular-nums text-muted">
                    {d.sessoes.toLocaleString("pt-BR")} ({pct((d.sessoes / totalSessions) * 100)})
                  </span>
                  <span className="col-span-2">
                    <InlineBar value={d.sessoes} max={totalSessions} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
