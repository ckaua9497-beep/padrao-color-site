import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconCheck } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { ArtUpload, PaymentWatcher, PixBox } from "@/components/vitrine/OrderClient";
import { formatCep, formatDocument } from "@/lib/api/validation";
import { formatBRL } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_LABEL, sqlDate, whatsappLink, type OrderStatus } from "@/lib/multiloja/core";
import { getPedidoByCodigo, listItens } from "@/lib/multiloja/repo-vendas";
import { lojaDoHost } from "@/lib/multiloja/tenant";
import { refreshPayment, tokenMatches } from "@/lib/multiloja/vendas";

export const metadata: Metadata = { title: "Seu pedido", robots: { index: false } };

const STEPS: OrderStatus[] = ["aguardando_pagamento", "pago", "em_producao", "enviado", "entregue"];

const TITLE: Record<OrderStatus, string> = {
  aguardando_pagamento: "Falta só o pagamento",
  pago: "Pedido confirmado!",
  em_producao: "Seu pedido está em produção",
  enviado: "Seu pedido está a caminho",
  entregue: "Pedido entregue!",
  cancelado: ORDER_STATUS_LABEL.cancelado,
  expirado: ORDER_STATUS_LABEL.expirado,
};

const when = (value: string) => sqlDate(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function VitrinePedido(props: PageProps<"/vitrine/[host]/pedido/[codigo]">) {
  const { host, codigo } = await props.params;
  const search = await props.searchParams;
  const token = typeof search.t === "string" ? search.t : "";
  const loja = lojaDoHost(host);
  const found = loja ? getPedidoByCodigo(codigo) : null;
  if (!loja || !found || found.lojaId !== loja.id || !tokenMatches(found, token)) notFound();

  const pedido = await refreshPayment(found);
  const itens = listItens(pedido.id);
  const stepIndex = STEPS.indexOf(pedido.status);
  const closed = pedido.status === "cancelado" || pedido.status === "expirado";
  const contact = loja.whatsapp ? whatsappLink(loja.whatsapp, `Olá! Sobre o pedido ${pedido.codigo}.`) : null;
  const e = pedido.entrega;

  return (
    <div className="bg-page-checkout">
      <PaymentWatcher codigo={pedido.codigo} token={token} status={pedido.status} />
      <div className="container-site max-w-4xl space-y-6 py-12">
        <div>
          <p className="text-caption font-semibold text-muted">Pedido {pedido.codigo}</p>
          <h1 className="text-section font-bold">{TITLE[pedido.status]}</h1>
          <p className="mt-2 text-muted">
            Feito em {when(pedido.criadoEm)}. Guarde este link para acompanhar o pedido.
          </p>
        </div>

        {!closed && (
          <ol className="grid grid-cols-5 gap-1 rounded-card bg-white p-4 shadow-card" aria-label="Andamento do pedido">
            {STEPS.map((status, i) => {
              const done = i <= stepIndex;
              return (
                <li key={status} aria-current={i === stepIndex ? "step" : undefined} className="flex flex-col items-center gap-2 text-center">
                  <span className={cx("grid size-8 place-items-center rounded-full text-sm font-bold", done ? "bg-ink text-white" : "bg-mist text-muted")}>{done ? <IconCheck aria-hidden className="size-4" /> : i + 1}</span>
                  <span className={cx("text-[12px] leading-tight sm:text-caption", done ? "font-bold" : "text-muted")}>{ORDER_STATUS_LABEL[status]}</span>
                </li>
              );
            })}
          </ol>
        )}

        {pedido.status === "aguardando_pagamento" && (
          <section className="rounded-card bg-white p-6 shadow-card" aria-labelledby="pagar">
            <h2 id="pagar" className="mb-4 text-xl font-bold">
              Pague {formatBRL(pedido.total)} {pedido.formaPagamento === "pix" ? "com Pix" : "no cartão"}
            </h2>
            {pedido.formaPagamento === "pix" && pedido.pagamento.pixCode ? (
              <PixBox code={pedido.pagamento.pixCode} image={pedido.pagamento.pixImage} expiresAt={pedido.pagamento.expiresAt} simulated={pedido.pagamentoProvedor === "simulado"} codigo={pedido.codigo} token={token} />
            ) : pedido.formaPagamento === "cartao" && pedido.pagamento.checkoutUrl && pedido.pagamentoProvedor === "efi" ? (
              <div className="space-y-3">
                <p className="text-[15px]">O pagamento com cartão é feito na página segura da Efí, parceira de pagamentos da loja.</p>
                <Button href={pedido.pagamento.checkoutUrl} size="md">
                  Pagar com cartão
                </Button>
              </div>
            ) : pedido.pagamentoProvedor === "simulado" ? (
              <PixBox code={`CARTAO-DE-TESTE-${pedido.codigo}`} simulated codigo={pedido.codigo} token={token} />
            ) : (
              <p className="text-[15px]">A cobrança não abriu. Fale com a loja para pagar{contact ? " pelo WhatsApp" : ""}.</p>
            )}
            <p className="mt-4 text-caption text-muted">Assim que o pagamento for confirmado, esta página muda sozinha.</p>
          </section>
        )}

        <section className="rounded-card bg-white p-6 shadow-card" aria-labelledby="itens">
          <h2 id="itens" className="text-xl font-bold">
            Itens
          </h2>
          <ul className="mt-4 divide-y divide-line">
            {itens.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.nome}</p>
                  <p className="text-caption text-muted">
                    {item.unidades.toLocaleString("pt-BR")} {item.unidades === 1 ? "unidade" : "unidades"}
                    {item.larguraCm && item.alturaCm ? ` · ${item.larguraCm} × ${item.alturaCm} cm` : ""}
                    {item.expresso ? " · prazo expresso" : ""}
                  </p>
                  {Object.keys(item.opcoes).length > 0 && (
                    <p className="text-caption text-muted">
                      {Object.entries(item.opcoes)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </p>
                  )}
                  <p className={cx("mt-1 text-caption font-semibold", item.arteArquivo ? "text-ink" : "text-coral-700")}>{item.arteArquivo ? `Arte recebida: ${item.arteNome}` : "Arte ainda não enviada"}</p>
                  {!closed && pedido.status !== "enviado" && pedido.status !== "entregue" && <ArtUpload codigo={pedido.codigo} token={token} posicao={item.posicao} hasArt={Boolean(item.arteArquivo)} />}
                </div>
                <p className="font-bold tabular-nums">{formatBRL(item.total)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1.5 border-t border-line pt-4 text-[15px] tabular-nums">
            <div className="flex justify-between">
              <dt className="text-muted">Produtos</dt>
              <dd>{formatBRL(pedido.subtotal)}</dd>
            </div>
            {pedido.desconto > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Desconto Pix</dt>
                <dd>− {formatBRL(pedido.desconto)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">Frete</dt>
              <dd>{pedido.frete > 0 ? formatBRL(pedido.frete) : "Grátis"}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-lg font-black">
              <dt>Total ({PAYMENT_LABEL[pedido.formaPagamento]})</dt>
              <dd>{formatBRL(pedido.total)}</dd>
            </div>
          </dl>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-card bg-white p-6 shadow-card">
            <h2 className="text-lg font-bold">Entrega</h2>
            <p className="mt-2 text-[15px] leading-relaxed">
              {pedido.cliente.nome}
              <br />
              {e.logradouro}, {e.numero}
              {e.complemento ? ` – ${e.complemento}` : ""}
              <br />
              {e.bairro ? `${e.bairro} · ` : ""}
              {e.cidade}/{e.estado} · CEP {formatCep(e.cep)}
            </p>
            <p className="mt-2 text-caption text-muted">CPF/CNPJ {formatDocument(pedido.cliente.documento)}</p>
          </div>
          <div className="rounded-card bg-white p-6 shadow-card">
            <h2 className="text-lg font-bold">Dúvidas?</h2>
            <p className="mt-2 text-[15px]">Fale com a {loja.nome} informando o código {pedido.codigo}.</p>
            {contact && (
              <Button href={contact} target="_blank" rel="noreferrer" variant="outline" size="sm" className="mt-4">
                Falar no WhatsApp
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
