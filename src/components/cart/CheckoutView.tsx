"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { track } from "@/lib/tracking";
import { getJson, lookupCep, postJson } from "@/components/account/client-api";
import { FormAlert } from "@/components/account/FormBits";
import { LoginForm } from "@/components/account/LoginForm";
import { SignupForm } from "@/components/account/SignupForm";
import { IconCheck } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cx } from "@/components/ui/cx";
import { formatCep, isValidCep } from "@/lib/api/validation";
import type { RotaDoCliente } from "@/lib/cliente";
import { creditoDisponivel, divisaoDoPagamento } from "@/lib/creditos";
import { LOJA_PADRAO, lojaRetirada, pagaNaRetiradaPermitido, type ModoEntrega } from "@/lib/entrega";
import { setCustomer, useCustomer } from "@/lib/customer";
import { formatBRL } from "@/lib/format";
import {
  addressProblem,
  orderTotal,
  PAYMENT_METHODS,
  type DeliveryAddress,
  type DeliveryChoice,
  type LineError,
  type OrderPayload,
  type PaymentMethod,
} from "@/lib/orders";
import { ItemTags, ResellerNote } from "./CartDrawer";
import { CartThumb } from "./CartThumb";
import { EntregaCheckout, Option, addressText, entregaTexto, type CotacaoTela, type EscolhaEntrega } from "./EntregaCheckout";
import { pendingArtFiles, uploadCartArt, type UploadProgress } from "./art-upload";
import { itemStoredFiles, quantityText, toOrderItem, useCart, type CartItem } from "./CartProvider";
import { TermosArte } from "@/components/product/TermosArte";
import { levaArte, novoAceite } from "@/lib/termos-arte";
import { PrintFileLink } from "@/components/product/gabarito/PrintFileLink";
import { keepPrintFiles } from "@/components/product/gabarito/print-store";

/*
 * Checkout: 1 Identificação (sessão: entrar ou criar conta, porque o POST /gerarpedido exige idCliente),
 * 2 Entrega (Delivery Padrão pela rota do cadastro, retirada numa das lojas ou transportadora cotada: EntregaCheckout),
 * 3 Pagamento (Pix, cartão ou, com a liberação, pagar na retirada; os créditos Padrão Color pagam tudo ou parte: creditos.ts). Ao finalizar, os arquivos da arte que
 * estão no navegador sobem para o Bunny (art-upload.ts) e as URLs vão no pedido (arte.anexos). O servidor recalcula
 * os preços (balcão ou revenda) e monta o payload (src/lib/orders.ts). Com PADRAO_ORDERS_ENABLED desligado é uma
 * SIMULAÇÃO: mostra o que seria enviado e não cria nada na Padrão Color.
 */

/** O item com as URLs dos seus arquivos que acabaram de subir para o Bunny. */
function withUploads(item: CartItem, uploaded: Record<string, { url: string; nome: string }>): CartItem {
  const mine = itemStoredFiles(item).filter((file) => uploaded[file.id]);
  return mine.length ? { ...item, uploaded: { ...item.uploaded, ...Object.fromEntries(mine.map((file) => [file.id, uploaded[file.id]])) } } : item;
}

type AccountSummary = {
  customerId: number;
  document: string;
  address: DeliveryAddress | null;
  balance: number | null;
  blocked: number | null;
  rota: RotaDoCliente;
  pagaNaRetirada: boolean;
};
type QuoteLine = { key: string; unitPrice: number; total: number; reseller: boolean };
type Quote = { total: number; credito?: number; reseller: boolean; lines: QuoteLine[] };
type OrderReply =
  | { mode: "simulation"; payload: OrderPayload; quote: Quote }
  | { mode: "order"; order: number | null; quote: Quote; duplicate?: boolean }
  | { mode: "queued"; protocolo: string; etapa: "pendente" | "conferir"; quote: Quote | null };
type PrintFile = { id: string; name: string; product: string };
type Result =
  | { mode: "simulation"; payload: OrderPayload; quote: Quote; files: PrintFile[] }
  | { mode: "order"; order: number | null; quote: Quote; method: PaymentMethod; cancelled: boolean; files: PrintFile[] }
  | { mode: "queued"; protocolo: string; etapa: "pendente" | "conferir"; total: number; credito: number; method: PaymentMethod; files: PrintFile[] };

/** Arquivos de impressão no gabarito do pedido (PDF guardado no navegador), para baixar ou reenviar. */
function PrintFiles({ files, className }: { files: PrintFile[]; className?: string }) {
  if (!files.length) return null;
  return (
    <section className={cx("rounded-control bg-white p-5 text-left", className)} aria-labelledby="arquivos-gabarito">
      <h2 id="arquivos-gabarito" className="text-[15px] font-bold">
        Arte encaixada no gabarito
      </h2>
      <p className="mt-1 text-caption text-muted">PDF no tamanho real de cada peça, sem as linhas do gabarito. Se a Padrão Color pedir a arte, é este arquivo que você envia.</p>
      <ul className="mt-3 grid gap-2">
        {files.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold">{file.product}</span>
            <PrintFileLink file={file} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const EMPTY_ADDRESS: DeliveryAddress = { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "" };

function Step({
  n,
  title,
  done,
  active,
  hint,
  onEdit,
  editLabel = "Alterar",
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  hint: string;
  onEdit?: () => void;
  editLabel?: string;
  children: ReactNode;
}) {
  return (
    <section aria-current={active ? "step" : undefined} className={cx("rounded-control bg-white p-6 transition-opacity", !active && !done && "opacity-70")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-bold">
          <span className={cx("grid size-6 place-items-center rounded-full text-[12px] text-white", done || active ? "bg-ink" : "bg-muted")}>
            {done ? <IconCheck aria-hidden className="size-3.5" strokeWidth={2.6} /> : n}
          </span>
          {title}
          {done && <span className="sr-only">(concluído)</span>}
        </h2>
        {done && onEdit && (
          <Button variant="link" size="sm" onClick={onEdit}>
            {editLabel}
            {editLabel === "Alterar" && <span className="sr-only"> {title.toLowerCase()}</span>}
          </Button>
        )}
      </div>
      {active ? <div className="mt-4">{children}</div> : <p className="mt-2 text-caption text-muted">{hint}</p>}
    </section>
  );
}

/** Desistir da compra criada (pagamento não feito) → POST /api/pedidos/compra/[id]/cancelar. */
function CancelPurchase({ order, onCancelled }: { order: number; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Desisti do pagamento");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    const reply = await postJson(`/api/pedidos/compra/${order}/cancelar`, { motivo: reason });
    setBusy(false);
    if (!reply.ok) {
      setError(reply.error);
      return;
    }
    setOpen(false);
    onCancelled();
  };
  return (
    <>
      <Button variant="link" size="sm" onClick={() => setOpen(true)}>
        Não vou pagar: cancelar a compra
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={`Cancelar a compra ${order}`} className="max-w-md p-6 md:p-8">
        <h2 className="text-xl font-bold">Cancelar a compra {order}?</h2>
        <p className="mt-2 text-sm text-muted">Os pedidos dessa compra não entram em produção.</p>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Motivo</legend>
          {["Desisti do pagamento", "O pagamento foi recusado", "Quero mudar o pedido"].map((value) => (
            <Option key={value} name="motivo-compra" checked={reason === value} onSelect={() => setReason(value)} title={value} />
          ))}
        </fieldset>
        {error && <FormAlert className="mt-3">{error}</FormAlert>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="dark" size="sm" loading={busy} onClick={confirm}>
            Cancelar compra
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Voltar
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function SimulationResult({ payload, files, onBack }: { payload: OrderPayload; files: PrintFile[]; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-[960px] px-5 py-12">
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-ink text-white">
          <IconCheck aria-hidden className="size-8" strokeWidth={2.4} />
        </span>
        <Badge tone="pix" className="mt-6">
          Simulação
        </Badge>
        <h1 className="mt-3 text-3xl font-bold">Pedido simulado: nada foi enviado</h1>
        <p className="mx-auto mt-3 max-w-2xl text-ink/75">
          O envio de pedidos para a Padrão Color está desligado (PADRAO_ORDERS_ENABLED). Abaixo está exatamente o que o site mandaria no POST /gerarpedido, com os preços da sua conta. Nenhum pagamento foi processado.
        </p>
      </div>

      <section className="mt-8 rounded-control bg-white p-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-caption text-muted">idCliente</dt>
            <dd className="font-semibold">{payload.idCliente}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">tipo_compra</dt>
            <dd className="font-semibold">{payload.tipo_compra ?? "sem código (PADRAO_TIPO_COMPRA)"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">envio</dt>
            <dd className="font-semibold">{payload.envio}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">data e hora</dt>
            <dd className="font-semibold">
              {payload.data} · {payload.hora}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted">previsao</dt>
            <dd className="font-semibold">{payload.previsao ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-caption text-muted">nome_trabalho</dt>
            <dd className="font-semibold">{payload.nome_trabalho}</dd>
          </div>
        </dl>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm tabular-nums">
            <caption className="sr-only">Produtos do pedido</caption>
            <thead className="text-caption text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">Produto</th>
                <th className="py-2 pr-3 font-semibold">id / groupId</th>
                <th className="py-2 pr-3 font-semibold">Quantidade</th>
                <th className="py-2 pr-3 font-semibold">price</th>
                <th className="py-2 font-semibold">precoTotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {payload.produtos.map((product, index) => (
                <tr key={`${product.id}-${index}`}>
                  <td className="py-2.5 pr-3 align-top">
                    <span className="font-semibold">{product.productName}</span>
                    <span className="block text-caption text-muted">
                      {[
                        product.nome_trabalho !== product.productName ? product.nome_trabalho : "",
                        `${product.tipoProducao}${product.productionTime ? ` · ${product.productionTime} d.u.` : ""}`,
                        product.largura ? `${product.largura}×${product.altura} cm (${product.area} m²)` : "",
                        product.kit?.nome ?? "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {product.arte.anexos.length ? (
                      <ul className="mt-1 grid gap-0.5 text-caption">
                        {product.arte.anexos.map((anexo) => (
                          <li key={anexo.url}>
                            <a href={anexo.url} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-2">
                              {anexo.nome}
                            </a>{" "}
                            <span className="text-muted">· {anexo.tipoArquivo}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="block text-caption text-muted">arte: sem arquivo anexado</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    {product.id} / {product.groupId}
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    {product.quantidade.toLocaleString("pt-BR")}
                    {product.unidades !== product.quantidade && <span className="block text-caption text-muted">{product.unidades.toLocaleString("pt-BR")} un.</span>}
                  </td>
                  <td className="py-2.5 pr-3 align-top">{formatBRL(product.price)}</td>
                  <td className="py-2.5 align-top font-semibold">{formatBRL(product.precoTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-caption text-muted">pagamento</dt>
            <dd className="font-semibold">
              {payload.pagamento.tipo}
              {payload.credito_usado > 0 && payload.pagamento.forma !== "credito" ? ` · ${formatBRL(payload.pagamento.valor)} + ${formatBRL(payload.credito_usado)} em créditos` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted">entrega</dt>
            <dd className="font-semibold">{entregaTexto(payload.entrega)}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">precoTotal</dt>
            <dd className="text-lg font-black">{formatBRL(payload.precoTotal)}</dd>
          </div>
        </dl>
        <PrintFiles files={files} className="mt-6 ring-1 ring-line" />
        <details className="mt-6 rounded-control bg-mist p-4">
          <summary className="cursor-pointer text-sm font-semibold">Ver o JSON do POST /gerarpedido</summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-thumb bg-ink p-4 text-[12px] leading-relaxed text-white">{JSON.stringify(payload, null, 2)}</pre>
        </details>
      </section>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="outline" size="md" onClick={onBack}>
          Voltar ao checkout
        </Button>
        <Button href="/" variant="buy" size="md">
          Voltar para a loja
        </Button>
      </div>
    </div>
  );
}

/** Como o total foi pago: créditos, créditos e outra forma, ou só a forma escolhida. */
function pagamentoTexto(total: number, credito: number, method: PaymentMethod): string {
  const forma = method === "retirada" ? "a pagar na retirada ou na entrega" : `no ${PAYMENT_METHODS[method].label}`;
  if (credito > 0 && credito >= total) return `Total de ${formatBRL(total)}, pago com os seus créditos Padrão Color.`;
  if (credito > 0) return `Total de ${formatBRL(total)}: ${formatBRL(credito)} com os seus créditos Padrão Color e ${formatBRL(Math.round((total - credito) * 100) / 100)} ${forma}.`;
  return `Total de ${formatBRL(total)} ${forma}.`;
}

function OrderResult({ result, onCancelled }: { result: Extract<Result, { mode: "order" }>; onCancelled: () => void }) {
  const credito = result.quote.credito ?? 0;
  return (
    <div className="mx-auto max-w-xl px-5 py-20 text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-ink text-white">
        <IconCheck aria-hidden className="size-8" strokeWidth={2.4} />
      </span>
      <h1 className="mt-6 text-3xl font-bold">{result.cancelled ? "Compra cancelada" : result.order ? `Pedido nº ${result.order} criado` : "Pedido criado"}</h1>
      {result.cancelled ? (
        <p className="mt-3 text-ink/75">A compra foi cancelada e não entra em produção.</p>
      ) : (
        <>
          <p className="mt-3 text-ink/75">
            {pagamentoTexto(result.quote.total, credito, result.method)}{" "}
            {credito >= result.quote.total
              ? "A produção começa depois que a Padrão Color confirmar."
              : result.method === "retirada"
                ? "A produção segue as regras do seu cadastro."
                : "Pagamento pendente: a Padrão Color envia as instruções de pagamento pelo e-mail e telefone do seu cadastro. A produção começa depois da confirmação."}
          </p>
          <p className="mt-3 text-sm text-muted">Se a arte ainda não foi enviada, mande pelo pedido em Meus pedidos.</p>
          <PrintFiles files={result.files} className="mt-6 ring-1 ring-line" />
          {result.order && (
            <div className="mt-4">
              <CancelPurchase order={result.order} onCancelled={onCancelled} />
            </div>
          )}
        </>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/conta/pedidos" variant="buy" size="md">
          Ver meus pedidos
        </Button>
        <Button href="/" variant="outline" size="md">
          Voltar para a loja
        </Button>
      </div>
    </div>
  );
}

/**
 * Pedido guardado na fila do site (src/lib/fila-pedidos): a API da Padrão não recebeu ou não confirmou. O pedido e as
 * artes estão no servidor do site; o cliente fica com o protocolo e não precisa mandar de novo.
 */
function QueuedResult({ result }: { result: Extract<Result, { mode: "queued" }> }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-20 text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-ink text-white">
        <IconCheck aria-hidden className="size-8" strokeWidth={2.4} />
      </span>
      <h1 className="mt-6 text-3xl font-bold">Pedido recebido</h1>
      <p className="mt-2 text-lg font-semibold">
        Protocolo <span className="tabular-nums">{result.protocolo}</span>
      </p>
      <p className="mt-3 text-ink/75">
        {result.etapa === "pendente"
          ? "A conexão com o sistema de produção da Padrão Color caiu agora. Seu pedido e suas artes ficaram guardados e vão para a produção sozinhos assim que a conexão voltar: não precisa enviar de novo."
          : "O sistema de produção da Padrão Color não confirmou o recebimento. Seu pedido e suas artes estão guardados: a nossa equipe confere e confirma com você. Não envie de novo."}
      </p>
      <p className="mt-3 text-sm text-muted">
        {pagamentoTexto(result.total, result.credito, result.method)} Nada foi cobrado: as instruções de pagamento chegam pelo e-mail e telefone do cadastro quando o pedido for criado. O número do pedido aparece em Meus pedidos.
      </p>
      <PrintFiles files={result.files} className="mt-6 ring-1 ring-line" />
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/conta/pedidos" variant="buy" size="md">
          Ver meus pedidos
        </Button>
        <Button href="/" variant="outline" size="md">
          Voltar para a loja
        </Button>
      </div>
    </div>
  );
}

export default function CheckoutView({ ordersEnabled }: { ordersEnabled: boolean }) {
  const { lines, subtotal, reseller, pricing, clear, setUploaded } = useCart();
  const customer = useCustomer();
  const logged = customer.status === "customer" || customer.status === "reseller";
  const [authTab, setAuthTab] = useState<"entrar" | "criar">("entrar");
  const [authInfo, setAuthInfo] = useState<{ tone: "success" | "info"; text: string } | null>(null);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [escolha, setEscolha] = useState<EscolhaEntrega>({ modo: null, loja: null, outro: false, servico: null });
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY_ADDRESS);
  // Cotação da transportadora para o CEP e o carrinho de agora (chave): enquanto a chave não bate, está calculando.
  const [cotacao, setCotacao] = useState<CotacaoTela | null>(null);
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [deliveryDone, setDeliveryDone] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  // Créditos Padrão Color: como no site antigo, começa em "Não usar créditos agora".
  const [usarCredito, setUsarCredito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<LineError[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [checkOrders, setCheckOrders] = useState(false);
  const [busy, setBusy] = useState(false);
  // Envio dos arquivos da arte para o Bunny (antes do pedido) e o aviso de arquivo que ficou para depois.
  const [sending, setSending] = useState<UploadProgress | null>(null);
  const [artNotice, setArtNotice] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // Termos de envio de arte para os itens personalizados que chegaram sem o aceite (carrinho antigo, kit, festa, fachada).
  const [termosAceitos, setTermosAceitos] = useState(false);
  const [termosFaltando, setTermosFaltando] = useState(false);
  // CEP da última busca: resposta atrasada de um CEP anterior é descartada.
  const cepAsked = useRef("");

  // Sessão perdida no meio (token vencido, cookie apagado): volta para a identificação com o aviso, sem a
  // entrega, o orçamento e os erros da conta anterior.
  const sessionLost = useCallback(() => {
    setCustomer({ status: "anonymous" });
    setDeliveryDone(false);
    setQuote(null);
    setError(null);
    setItemErrors([]);
    setCheckOrders(false);
    setAuthTab("entrar");
    setAuthInfo({ tone: "info", text: "Sua sessão expirou. Entre de novo para continuar a compra: o carrinho continua aqui." });
  }, []);

  // Rastreamento: abriu o checkout (abandono de checkout).
  useEffect(() => {
    track("checkout_inicio");
  }, []);

  // Endereço do cadastro e saldo (GET /api/conta/resumo) da conta logada.
  const customerId = logged ? customer.id : undefined;
  useEffect(() => {
    if (!customerId) return;
    let alive = true;
    getJson<Omit<AccountSummary, "customerId">>("/api/conta/resumo").then((reply) => {
      if (!alive) return;
      if (reply.ok) setSummary({ ...reply.data, customerId });
      else if (reply.status === 401) sessionLost();
      // Sem o cadastro agora: segue com a retirada ou a transportadora em outro endereço.
      else setSummary({ customerId, document: "", address: null, balance: null, blocked: null, rota: { tipo: "transportadora" }, pagaNaRetirada: false });
    });
    return () => {
      alive = false;
    };
  }, [customerId, sessionLost]);

  const account = summary && summary.customerId === customerId ? summary : null;
  const registered = account?.address && !addressProblem(account.address) ? account.address : null;
  const temRota = account?.rota.tipo === "rota" && Boolean(registered);
  // Sem escolha ainda: Delivery Padrão quando o cadastro tem rota; senão, a transportadora.
  const modo: ModoEntrega = escolha.modo === "rota" && account && !temRota ? "transportadora" : (escolha.modo ?? (temRota || !account ? "rota" : "transportadora"));
  const outroEndereco = escolha.outro || !registered;
  // Retirada: a Loja São João já vem marcada, como no site antigo.
  const loja = escolha.loja ?? LOJA_PADRAO;
  const destinoCep = modo !== "transportadora" ? "" : outroEndereco ? (isValidCep(address.cep) ? address.cep.replace(/\D/g, "") : "") : registered.cep;
  const itensFrete = JSON.stringify(lines.map((line) => ({ groupId: line.item.groupId, variationId: line.item.variationId, quantity: line.item.quantity })));
  const chaveCotacao = destinoCep ? `${destinoCep}|${itensFrete}` : "";
  const cotacaoAtual = cotacao && cotacao.chave === chaveCotacao ? cotacao : null;
  const opcaoFrete = cotacaoAtual?.tipo === "opcoes" ? (cotacaoAtual.opcoes.find((o) => o.id === escolha.servico) ?? null) : null;
  const rotaCliente = account?.rota.tipo === "rota" ? account.rota : null;
  const frete = modo === "rota" ? (rotaCliente?.cobradaNoPedido ? rotaCliente.taxa : 0) : modo === "transportadora" ? (opcaoFrete?.preco ?? 0) : 0;
  const delivery: DeliveryChoice =
    modo === "rota" ? { kind: "rota" } : modo === "retirada" ? { kind: "retirada", loja } : { kind: "transportadora", address: outroEndereco ? address : null, servico: opcaoFrete?.id ?? null };
  const podePagarNaRetirada = pagaNaRetiradaPermitido({ liberado: Boolean(account?.pagaNaRetirada), modo, loja });
  const pagamento: PaymentMethod = payment === "retirada" && !podePagarNaRetirada ? "pix" : payment;
  const total = Math.round((orderTotal(lines) + frete) * 100) / 100;
  // Crédito da conta corrente (saldo menos o bloqueado) e o que ele paga deste total; o servidor confere no fechamento.
  const disponivel = creditoDisponivel(account?.balance, account?.blocked);
  const comCredito = usarCredito && disponivel > 0;
  const divisao = divisaoDoPagamento(total, disponivel, comCredito);
  const soCredito = divisao.credito > 0 && divisao.restante === 0;
  const step = !logged ? 1 : !deliveryDone ? 2 : 3;

  // Transportadora: cota o carrinho no CEP de destino (POST /api/pedidos/frete); o pedido cota de novo no fechamento.
  useEffect(() => {
    if (!chaveCotacao) return;
    let alive = true;
    const corte = chaveCotacao.indexOf("|");
    const [cep, itens] = [chaveCotacao.slice(0, corte), JSON.parse(chaveCotacao.slice(corte + 1)) as unknown[]];
    postJson<{ tipo: "opcoes"; opcoes: [] } | { tipo: "combinar"; motivo: "desligado" | "sem-medida" }>("/api/pedidos/frete", { cep, items: itens }).then((reply) => {
      if (!alive) return;
      setCotacao(reply.ok ? ({ chave: chaveCotacao, ...reply.data } as CotacaoTela) : { chave: chaveCotacao, tipo: "erro", erro: reply.error });
    });
    return () => {
      alive = false;
    };
  }, [chaveCotacao]);

  if (result?.mode === "simulation") return <SimulationResult payload={result.payload} files={result.files} onBack={() => setResult(null)} />;
  if (result?.mode === "order") return <OrderResult result={result} onCancelled={() => setResult({ ...result, cancelled: true })} />;
  if (result?.mode === "queued") return <QueuedResult result={result} />;

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-2xl font-bold">Seu carrinho está vazio.</h1>
        <Button href="/produtos" variant="buy" size="md" className="mt-6">
          Ver produtos
        </Button>
      </div>
    );
  }

  const onCep = async (value: string) => {
    const cep = formatCep(value);
    setAddress((current) => ({ ...current, cep }));
    const digits = cep.replace(/\D/g, "");
    cepAsked.current = digits;
    if (digits.length !== 8) {
      setCepStatus(null);
      return;
    }
    setCepStatus("Buscando o endereço…");
    const found = await lookupCep(cep);
    if (cepAsked.current !== digits) return;
    if (!found) {
      setCepStatus("CEP não encontrado. Preencha o endereço.");
      return;
    }
    setAddress((current) => ({ ...current, logradouro: found.logradouro || current.logradouro, bairro: found.bairro || current.bairro, cidade: found.cidade || current.cidade, estado: found.estado || current.estado }));
    setCepStatus("Endereço encontrado. Confira e informe o número.");
  };

  const confirmDelivery = () => {
    const problem =
      modo === "rota"
        ? !temRota
          ? "Seu endereço não tem rota de entrega da Padrão: escolha a retirada ou a transportadora."
          : null
        : modo === "retirada"
          ? !lojaRetirada(loja)
            ? "Escolha a loja de retirada."
            : null
          : (outroEndereco && addressProblem(address)) ||
            (!cotacaoAtual
              ? "Aguarde o cálculo do frete."
              : cotacaoAtual.tipo === "erro"
                ? cotacaoAtual.erro
                : cotacaoAtual.tipo === "opcoes" && !opcaoFrete
                  ? cotacaoAtual.opcoes.length
                    ? "Escolha a forma de entrega."
                    : "Nenhuma transportadora atende este CEP. Escolha a retirada ou fale com o atendimento."
                  : null);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setDeliveryDone(true);
  };

  const semTermos = lines.filter((line) => levaArte(line.item) && !line.item.termosArte);

  const submit = async (expectedTotal: number) => {
    if (semTermos.length && !termosAceitos) {
      setTermosFaltando(true);
      document.getElementById("termos-checkout")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    setError(null);
    setItemErrors([]);
    setCheckOrders(false);
    // 1. Os arquivos da arte (PDF no gabarito e os enviados pelo cliente) sobem para o Bunny, uma vez cada.
    let items = lines.map((line) => line.item);
    if (pendingArtFiles(items).length) {
      setArtNotice(null);
      const outcome = await uploadCartArt(items, setSending);
      setSending(null);
      if (Object.keys(outcome.uploaded).length) {
        setUploaded(outcome.uploaded);
        items = items.map((item) => withUploads(item, outcome.uploaded));
      }
      if (!outcome.ok) {
        setBusy(false);
        setError(outcome.error);
        return;
      }
      if (outcome.disabled) setArtNotice("O envio de arquivos está desligado agora: a equipe pede a arte depois do pedido.");
      else if (outcome.missing.length) setArtNotice(`Não encontramos neste navegador: ${outcome.missing.join(", ")}. A equipe pede esses arquivos depois do pedido.`);
    }
    // 2. O pedido, com as URLs dos arquivos em cada item.
    const reply = await postJson<OrderReply>("/api/pedidos", {
      items: lines.map((line, index) => toOrderItem(items[index], line.unitPrice)),
      payment: pagamento,
      delivery,
      expectedTotal,
      ...(comCredito ? { usarCredito: true } : {}),
      ...(semTermos.length ? { termosArte: novoAceite(new Date()) } : {}),
    });
    setBusy(false);
    if (reply.ok) {
      setQuote(null);
      // PDFs no gabarito das linhas: o pedido guarda por alguns dias (o carrinho é limpo logo abaixo).
      const files = lines.flatMap((line) => (line.item.printFile ? [{ ...line.item.printFile, product: line.item.name }] : []));
      if (reply.data.mode === "simulation") {
        setResult({ mode: "simulation", payload: reply.data.payload, quote: reply.data.quote, files });
        return;
      }
      if (reply.data.mode === "queued") {
        // Guardado na fila do site: o carrinho já foi para o servidor, com as artes.
        keepPrintFiles(files, null);
        setResult({ mode: "queued", protocolo: reply.data.protocolo, etapa: reply.data.etapa, total: reply.data.quote?.total ?? expectedTotal, credito: reply.data.quote?.credito ?? divisao.credito, method: pagamento, files });
        clear();
        return;
      }
      keepPrintFiles(files, reply.data.order);
      setResult({ mode: "order", order: reply.data.order, quote: reply.data.quote, method: pagamento, cancelled: false, files });
      clear();
      return;
    }
    if (reply.status === 401) {
      sessionLost();
      return;
    }
    // Sem resposta da rota (internet caiu, proxy devolveu 5xx sem JSON): o pedido pode ter sido criado.
    if (reply.status === 0 || (reply.status >= 500 && typeof reply.data.error !== "string")) {
      setError("Não recebemos a confirmação do pedido. Confira em Meus pedidos antes de enviar de novo.");
      setCheckOrders(true);
      return;
    }
    setError(reply.error);
    if (reply.status === 409 && reply.data.quote) setQuote(reply.data.quote as Quote);
    if (reply.status === 422 && Array.isArray(reply.data.items)) setItemErrors(reply.data.items as LineError[]);
    if (reply.data.checkOrders) setCheckOrders(true);
  };

  // Trocar de conta no meio do checkout: sai (POST /api/conta/logout) e volta para a identificação.
  const switchAccount = async () => {
    const reply = await postJson("/api/conta/logout", {});
    if (!reply.ok) {
      setError(reply.error);
      return;
    }
    setCustomer({ status: "anonymous" });
    setDeliveryDone(false);
    setQuote(null);
  };

  const lojaEscolhida = lojaRetirada(loja);
  const freteTexto = (valor: number) => (valor > 0 ? formatBRL(valor) : "sem frete");
  const deliveryHint = !deliveryDone
    ? "Escolha como receber o pedido."
    : modo === "rota"
      ? `Delivery Padrão · ${rotaCliente?.nome ?? ""} · ${rotaCliente && !rotaCliente.cobradaNoPedido && rotaCliente.taxa > 0 ? "taxa paga na entrega" : freteTexto(frete)}`
      : modo === "retirada"
        ? `Retirada · ${lojaEscolhida?.nome ?? ""} · sem frete`
        : `${opcaoFrete ? `${opcaoFrete.titulo} · ${formatBRL(opcaoFrete.preco)}` : "Transportadora · frete combinado com o atendimento"} · ${outroEndereco ? addressText(address) : registered ? addressText(registered) : ""}`;

  return (
    <div className="mx-auto grid max-w-[1200px] gap-5 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <h1 className="sr-only">Finalizar compra</h1>
      <div className="space-y-5">
        {!ordersEnabled && (
          <p className="flex flex-wrap items-center gap-2 rounded-control bg-sun-50 p-4 text-sm text-ink">
            <Badge tone="dark">Simulação</Badge>
            O envio de pedidos está desligado: ao finalizar, você vê o pedido que seria enviado, sem criar nada na Padrão Color.
          </p>
        )}

        <Step
          n={1}
          title="Identificação"
          done={logged}
          active={!logged}
          hint={logged ? `${customer.name ?? "Cliente"}${account?.document ? ` · ${account.document}` : ""}${customer.status === "reseller" ? " · revendedor" : ""}` : "Entre ou crie sua conta para continuar."}
          onEdit={switchAccount}
          editLabel="Trocar de conta"
        >
          {customer.status === "loading" ? (
            <p role="status" className="text-sm text-muted">
              Verificando sua conta…
            </p>
          ) : (
            <>
              <p className="mb-4 text-caption text-ink/75">O pedido fica na sua conta Padrão Color: é por ela que você acompanha a produção, envia a arte e recebe a nota.</p>
              <SegmentedControl
                label="Identificação"
                value={authTab}
                onChange={(tab) => {
                  setAuthTab(tab);
                  setAuthInfo(null);
                }}
                options={[
                  { value: "entrar", label: "Já tenho conta" },
                  { value: "criar", label: "Criar conta" },
                ]}
                className="mb-5"
              />
              {authInfo && (
                <FormAlert tone={authInfo.tone} className="mb-4">
                  {authInfo.text}
                </FormAlert>
              )}
              {authTab === "entrar" ? (
                <LoginForm onSignup={() => setAuthTab("criar")} recoverHref="/conta/recuperar?volta=%2Fcheckout" />
              ) : (
                <SignupForm
                  onSuccess={({ loggedIn, message }) => {
                    if (loggedIn) return;
                    setAuthTab("entrar");
                    setAuthInfo({ tone: "success", text: message ?? "Conta criada! Entre para continuar." });
                  }}
                />
              )}
            </>
          )}
        </Step>

        <Step n={2} title="Entrega" done={logged && deliveryDone} active={step === 2} hint={logged ? deliveryHint : "Finalize a identificação para avançar."} onEdit={() => setDeliveryDone(false)}>
          <EntregaCheckout
            conta={account ? { rota: account.rota, pagaNaRetirada: account.pagaNaRetirada, registered } : null}
            modo={modo}
            escolha={{ ...escolha, loja }}
            onEscolha={(update) => {
              setEscolha((atual) => ({ ...atual, ...update }));
              setError(null);
              setQuote(null);
            }}
            address={address}
            setAddress={(update) => {
              setAddress(update);
              setEscolha((atual) => ({ ...atual, servico: null }));
            }}
            onCep={onCep}
            cepStatus={cepStatus}
            cotacao={cotacaoAtual}
            cotando={Boolean(chaveCotacao) && !cotacaoAtual}
          />
          {error && step === 2 && <FormAlert className="mt-4">{error}</FormAlert>}
          <Button variant="buy" size="md" block className="mt-5" onClick={confirmDelivery}>
            Continuar
          </Button>
        </Step>

        <Step n={3} title="Pagamento" done={false} active={step === 3} hint="Escolha a entrega para avançar.">
          {disponivel > 0 && (
            <fieldset className="mb-5 rounded-thumb bg-mist p-4">
              <legend className="float-left w-full text-[15px] font-bold">Créditos Padrão Color</legend>
              <p className="clear-left text-caption text-muted">
                Você tem <strong className="text-ink">{formatBRL(disponivel)}</strong> em créditos disponíveis
                {account?.blocked ? ` (${formatBRL(account.blocked)} bloqueado)` : ""}.
              </p>
              <div className="mt-3 space-y-2">
                <Option
                  name="credito"
                  checked={comCredito}
                  onSelect={() => {
                    setUsarCredito(true);
                    setQuote(null);
                  }}
                  title="Usar meus créditos nesta compra"
                >
                  {disponivel >= total ? "Os créditos pagam o pedido inteiro." : `${formatBRL(disponivel)} em créditos e o restante em outra forma de pagamento.`}
                </Option>
                <Option
                  name="credito"
                  checked={!comCredito}
                  onSelect={() => {
                    setUsarCredito(false);
                    setQuote(null);
                  }}
                  title="Não usar créditos agora"
                />
              </div>
            </fieldset>
          )}
          {soCredito ? (
            <p className="rounded-thumb border border-ink p-3.5 text-sm">
              <strong>Pago com os seus créditos:</strong> {formatBRL(divisao.credito)}. Não precisa de outra forma de pagamento.
            </p>
          ) : (
            <fieldset className="space-y-2">
              <legend className={divisao.credito > 0 ? "mb-2 text-sm font-semibold" : "sr-only"}>
                {divisao.credito > 0 ? `Forma de pagamento do restante (${formatBRL(divisao.restante)})` : "Forma de pagamento"}
              </legend>
              {(Object.keys(PAYMENT_METHODS) as PaymentMethod[])
                .filter((value) => value !== "retirada" || podePagarNaRetirada)
                .map((value) => (
                  <Option
                    key={value}
                    name="pagamento"
                    checked={pagamento === value}
                    onSelect={() => {
                      setPayment(value);
                      setQuote(null);
                    }}
                    title={value === "retirada" && modo === "rota" ? "Pagar na entrega" : PAYMENT_METHODS[value].label}
                  >
                    {PAYMENT_METHODS[value].hint}
                  </Option>
                ))}
            </fieldset>
          )}
          {account?.balance && account.balance < 0 ? (
            <p className="mt-4 rounded-thumb bg-mist p-3 text-caption">
              Sua conta corrente tem saldo devedor de <strong>{formatBRL(Math.abs(account.balance))}</strong>.
            </p>
          ) : account?.balance && account.balance > 0 && disponivel <= 0 ? (
            <p className="mt-4 rounded-thumb bg-mist p-3 text-caption">
              Seus créditos de <strong>{formatBRL(account.balance)}</strong> estão bloqueados agora e não podem pagar esta compra.
            </p>
          ) : null}
          <p className="mt-4 rounded-thumb bg-sun-50 p-3 text-caption text-ink/80">
            {ordersEnabled
              ? "Ainda não há pagamento online: o pedido é criado com pagamento pendente e a Padrão Color envia as instruções pelo e-mail e telefone do cadastro."
              : "Simulação: o pedido não é enviado e nenhum pagamento é processado."}
          </p>

          {quote && (
            <div role="alert" className="mt-4 rounded-thumb border border-ink bg-white p-4 text-sm">
              <p className="font-semibold">Os preços foram atualizados para a sua conta.</p>
              <p className="mt-1 text-muted">
                Total na tela: {formatBRL(total)} · novo total: <strong className="text-ink">{formatBRL(quote.total)}</strong>
              </p>
              <Button variant="dark" size="sm" className="mt-3" loading={busy} onClick={() => submit(quote.total)}>
                Confirmar com o novo total
              </Button>
            </div>
          )}
          {error && step === 3 && !quote && <FormAlert className="mt-4">{error}</FormAlert>}
          {itemErrors.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-coral-700">
              {itemErrors.map((item) => (
                <li key={item.key}>
                  <strong>{item.name}:</strong> {item.error}
                </li>
              ))}
            </ul>
          )}
          {checkOrders && (
            <Button href="/conta/pedidos" variant="link" size="sm" className="mt-2">
              Abrir Meus pedidos
            </Button>
          )}
          {artNotice && (
            <p role="status" className="mt-3 rounded-thumb bg-mist p-3 text-caption text-ink/80">
              {artNotice}
            </p>
          )}
          {semTermos.length > 0 && (
            <TermosArte
              id="termos-checkout"
              className="mt-4"
              aceito={termosAceitos}
              onAceito={(value) => {
                setTermosAceitos(value);
                if (value) setTermosFaltando(false);
              }}
              faltando={termosFaltando}
              detalhe={`para ${semTermos.length === 1 ? "o item personalizado" : `os ${semTermos.length} itens personalizados`} do pedido`}
            />
          )}
          {!quote && (
            <Button variant="buy" size="md" block className="mt-4" loading={busy} disabled={pricing} onClick={() => submit(total)}>
              {sending
                ? `Enviando os arquivos da arte (${Math.min(sending.done + 1, sending.total)} de ${sending.total})…`
                : pricing
                  ? "Atualizando preços…"
                  : ordersEnabled
                    ? `Finalizar pedido · ${formatBRL(total)}`
                    : `Simular pedido · ${formatBRL(total)}`}
            </Button>
          )}
        </Step>
      </div>

      <aside className="h-fit rounded-control bg-white p-6 lg:sticky lg:top-6" aria-label="Resumo do pedido">
        <h2 className="text-lg font-bold">Resumo do pedido</h2>
        <ul className="mt-5 space-y-4">
          {lines.map((line) => (
            <li key={line.item.key} className="flex gap-3">
              <CartThumb preview={line.item.preview} image={line.item.image} name={line.item.name} options={line.item.options} className="size-16" />
              <div className="min-w-0 flex-1 text-caption">
                <p className="line-clamp-2 font-semibold">{line.item.name}</p>
                <p className="text-muted">{quantityText(line.item)}</p>
                {line.item.options["Texto da arte"] && <p className="truncate text-muted">Texto: {line.item.options["Texto da arte"]}</p>}
                <ItemTags line={line} className="mt-1.5" />
              </div>
              <p className={cx("text-caption font-semibold tabular-nums", line.pending && "opacity-60")}>{formatBRL(line.total)}</p>
            </li>
          ))}
        </ul>
        <ResellerNote reseller={reseller} pricing={pricing} className="mt-5" />
        <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatBRL(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Entrega</dt>
            <dd>
              {!logged || !account
                ? "Na entrega"
                : modo === "retirada"
                  ? "Sem frete"
                  : modo === "rota"
                    ? rotaCliente && !rotaCliente.cobradaNoPedido && rotaCliente.taxa > 0
                      ? "Taxa paga na entrega"
                      : freteTexto(frete)
                    : opcaoFrete
                      ? formatBRL(opcaoFrete.preco)
                      : cotacaoAtual?.tipo === "combinar"
                        ? "A combinar"
                        : "A calcular"}
            </dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-base">
            <dt className="font-bold">Total</dt>
            <dd className="font-black">{formatBRL(total)}</dd>
          </div>
          {divisao.credito > 0 && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted">Créditos Padrão Color</dt>
                <dd>− {formatBRL(divisao.credito)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>A pagar</dt>
                <dd>{formatBRL(divisao.restante)}</dd>
              </div>
            </>
          )}
        </dl>
      </aside>
    </div>
  );
}
