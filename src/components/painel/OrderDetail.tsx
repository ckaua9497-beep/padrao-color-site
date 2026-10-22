import type { ReactNode } from "react";
import { formatCep, formatDocument, formatPhone } from "@/lib/api/validation";
import { formatBRL } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_LABEL, formatDateTime, isOrderStatus, whatsappLink } from "@/lib/multiloja/core";
import type { Pedido, PedidoEvento, PedidoItem } from "@/lib/multiloja/repo-vendas";
import StatusBadge from "./StatusBadge";

/* Detalhe do pedido, igual no painel do lojista e no admin da Padrão (o admin acrescenta as ações em `actions`). */

const GATEWAY_LABEL: Record<string, string> = { efi: "Efí", cielo: "Cielo", pagarme: "Pagar.me" };

function Row({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between border-t border-line pt-2 font-bold" : "flex justify-between"}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export default function OrderDetail({ pedido, itens, eventos, actions, lojaNome, admin = false }: { pedido: Pedido; itens: PedidoItem[]; eventos: PedidoEvento[]; actions?: ReactNode; lojaNome?: string; admin?: boolean }) {
  // O admin usa as folhas dele (anel fino); o painel do lojista, os cartões do painel.
  const surface = admin ? "rounded-card bg-white p-5 shadow-sheet" : "rounded-panel bg-white p-5 shadow-card";
  const e = pedido.entrega;
  const contact = whatsappLink(pedido.cliente.telefone, `Olá, ${pedido.cliente.nome.split(" ")[0]}! Sobre o seu pedido ${pedido.codigo}.`);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-caption font-semibold text-muted">{lojaNome ? `${lojaNome} · ` : ""}Pedido feito em {formatDateTime(pedido.criadoEm)}</p>
          <h1 className="text-title">{pedido.codigo}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={pedido.status} />
            <span className="text-caption text-muted">
              {PAYMENT_LABEL[pedido.formaPagamento]}
              {pedido.pagamentoProvedor && GATEWAY_LABEL[pedido.pagamentoProvedor] ? ` pela ${GATEWAY_LABEL[pedido.pagamentoProvedor]}` : ""}
              {pedido.pagoEm ? ` · pago em ${formatDateTime(pedido.pagoEm)}` : ""}
              {pedido.pagamentoProvedor === "simulado" ? " · pagamento de teste" : ""}
              {pedido.padraoPedido ? ` · pedido Padrão nº ${pedido.padraoPedido}` : ""}
            </span>
          </div>
        </div>
        {actions}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className={surface} aria-labelledby="itens-pedido">
          <h2 id="itens-pedido" className="text-lg font-bold">
            Itens
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {itens.map((item) => (
              <li key={item.id} className="py-3">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold">{item.nome}</p>
                  <p className="font-bold tabular-nums">{formatBRL(item.total)}</p>
                </div>
                <p className="text-caption text-muted">
                  {item.unidades.toLocaleString("pt-BR")} un.
                  {item.larguraCm && item.alturaCm ? ` · ${item.larguraCm} × ${item.alturaCm} cm` : ""}
                  {item.expresso ? " · expresso" : ""}
                  {item.prazoDias ? ` · produção em ${item.prazoDias} dias úteis` : ""} · margem {item.margem}% · custo {formatBRL(item.totalBase)}
                </p>
                {Object.keys(item.opcoes).length > 0 && (
                  <p className="text-caption text-muted">
                    {Object.entries(item.opcoes)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </p>
                )}
                <p className="mt-1 text-caption">
                  {item.arteArquivo ? (
                    <a href={`/api/multiloja/pedido/${pedido.codigo}/arte/${item.posicao}`} className="font-bold underline underline-offset-2">
                      Baixar arte ({item.arteNome})
                    </a>
                  ) : (
                    <span className="font-semibold text-coral-700">Arte ainda não enviada pelo cliente</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          <section className={surface} aria-labelledby="valores">
            <h2 id="valores" className="text-lg font-bold">
              Valores
            </h2>
            <dl className="mt-3 space-y-1.5 text-[15px]">
              <Row label="Produtos" value={formatBRL(pedido.subtotal)} />
              {pedido.desconto > 0 && <Row label="Desconto Pix" value={`− ${formatBRL(pedido.desconto)}`} />}
              <Row label={pedido.envio.servico ? `Frete · ${pedido.envio.servico}` : "Frete"} value={pedido.frete > 0 ? formatBRL(pedido.frete) : "Grátis"} />
              <Row label="Cliente pagou" value={formatBRL(pedido.total)} strong />
              <Row label="Custo Padrão Color" value={`− ${formatBRL(pedido.custoBase)}`} />
              {pedido.envio.custo > 0 && <Row label={pedido.envio.gratis ? "Frete dado pela loja (repasse)" : "Frete (repasse)"} value={`− ${formatBRL(pedido.envio.custo)}`} />}
              <Row label="Taxa do pagamento" value={`− ${formatBRL(pedido.taxaPagamento)}`} />
              <Row label="Comissão do lojista" value={formatBRL(pedido.comissao)} strong />
            </dl>
          </section>

          <section className={surface} aria-labelledby="cliente">
            <h2 id="cliente" className="text-lg font-bold">
              Cliente e entrega
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed">
              {pedido.cliente.nome}
              <br />
              {pedido.cliente.email}
              <br />
              {formatPhone(pedido.cliente.telefone)} · {formatDocument(pedido.cliente.documento)}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed">
              {e.logradouro}, {e.numero}
              {e.complemento ? ` – ${e.complemento}` : ""}
              <br />
              {e.bairro ? `${e.bairro} · ` : ""}
              {e.cidade}/{e.estado} · CEP {formatCep(e.cep)}
            </p>
            {pedido.envio.servico && (
              <p className="mt-3 rounded-control bg-mist p-3 text-[14px]">
                Envio: <strong>{pedido.envio.servico}</strong> (serviço {pedido.envio.servicoId}){pedido.envio.prazo && <> · chega em {pedido.envio.prazo} depois de pronto</>}
                {pedido.envio.gratis && <span className="block text-caption text-muted">Frete grátis para o cliente: o custo saiu da comissão do lojista.</span>}
              </p>
            )}
            {pedido.observacoes && <p className="mt-3 rounded-control bg-mist p-3 text-[14px]">Obs.: {pedido.observacoes}</p>}
            {pedido.ref && <p className="mt-3 text-caption text-muted">Veio pelo link de divulgação “{pedido.ref}”.</p>}
            <a href={contact} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-[14px] font-bold hover:border-ink">
              Falar com o cliente no WhatsApp
            </a>
          </section>
        </div>
      </div>

      <section className={surface} aria-labelledby="historico">
        <h2 id="historico" className="text-lg font-bold">
          Histórico
        </h2>
        <ol className="mt-3 space-y-2">
          {eventos.map((ev, i) => (
            <li key={i} className="flex flex-wrap gap-x-3 text-[14px]">
              <span className="tabular-nums text-muted">{formatDateTime(ev.criadoEm)}</span>
              <span className="font-bold">{isOrderStatus(ev.status) ? ORDER_STATUS_LABEL[ev.status] : ev.status}</span>
              {ev.nota && <span className="text-muted">{ev.nota}</span>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
