"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getJson, lookupCep, postJson } from "@/components/account/client-api";
import { FormAlert, UfSelect } from "@/components/account/FormBits";
import { LoginForm } from "@/components/account/LoginForm";
import { SignupForm } from "@/components/account/SignupForm";
import { IconCheck } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import { formatCep } from "@/lib/api/validation";
import { setCustomer, useCustomer } from "@/lib/customer";
import { formatBRL } from "@/lib/format";
import {
  addressProblem,
  orderTotals,
  PAYMENT_METHODS,
  type DeliveryAddress,
  type DeliveryChoice,
  type LineError,
  type OrderPayload,
  type OrderTotals,
  type PaymentMethod,
} from "@/lib/orders";
import { STORE } from "@/lib/store";
import { ItemTags, ResellerNote } from "./CartDrawer";
import { CartThumb } from "./CartThumb";
import { quantityText, toOrderItem, useCart } from "./CartProvider";

/*
 * Checkout: 1 Identificação (sessão: entrar ou criar conta, porque o POST /gerarpedido exige idCliente),
 * 2 Entrega (endereço do cadastro, outro endereço ou retirada), 3 Pagamento. O servidor recalcula os preços
 * (balcão ou revenda) e monta o payload (src/lib/orders.ts). Com PADRAO_ORDERS_ENABLED desligado é uma
 * SIMULAÇÃO: mostra o que seria enviado e não cria nada na Padrão Color.
 */

type AccountSummary = { customerId: number; document: string; address: DeliveryAddress | null; balance: number | null; blocked: number | null };
type QuoteLine = { key: string; unitPrice: number; total: number; reseller: boolean };
type Quote = { totals: OrderTotals; reseller: boolean; lines: QuoteLine[] };
type OrderReply = { mode: "simulation"; payload: OrderPayload; quote: Quote } | { mode: "order"; order: number | null; quote: Quote; duplicate?: boolean };
type Result = { mode: "simulation"; payload: OrderPayload; quote: Quote } | { mode: "order"; order: number | null; quote: Quote; method: PaymentMethod; cancelled: boolean };

const EMPTY_ADDRESS: DeliveryAddress = { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "" };

function addressText(address: DeliveryAddress): string {
  const street = `${address.logradouro}, ${address.numero}${address.complemento ? ` – ${address.complemento}` : ""}`;
  return [street, address.bairro, `${address.cidade}/${address.estado}`, address.cep ? `CEP ${formatCep(address.cep)}` : ""].filter(Boolean).join(" · ");
}

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

function Option({ checked, onSelect, name, title, children }: { checked: boolean; onSelect: () => void; name: string; title: string; children?: ReactNode }) {
  return (
    <label className={cx("flex items-start gap-3 rounded-thumb border p-3.5 transition-colors", checked ? "border-ink bg-mist" : "border-line")}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-1 size-4 shrink-0 accent-ink" />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{title}</span>
        {children && <span className="block text-caption text-muted">{children}</span>}
      </span>
    </label>
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

function SimulationResult({ payload, onBack }: { payload: OrderPayload; onBack: () => void }) {
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
            <dd className="font-semibold">{payload.tipo_compra}</dd>
          </div>
          <div className="sm:col-span-2">
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
                <th className="py-2 pr-3 font-semibold">idProduto / idGrupo</th>
                <th className="py-2 pr-3 font-semibold">Quantidade</th>
                <th className="py-2 pr-3 font-semibold">Valor unit.</th>
                <th className="py-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {payload.produtos.map((product, index) => (
                <tr key={`${product.idProduto}-${index}`}>
                  <td className="py-2.5 pr-3">
                    <span className="font-semibold">{product.descricao}</span>
                    <span className="block text-caption text-muted">
                      {[product.nome_trabalho !== product.descricao ? product.nome_trabalho : "", product.expresso ? "expresso" : "", product.largura ? `${product.largura}×${product.altura} cm (${product.area} m²)` : "", product.kit?.nome ?? "", product.arte ? `arte: ${product.arte}` : "arte: enviar depois"]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    {product.idProduto} / {product.idGrupo}
                  </td>
                  <td className="py-2.5 pr-3">
                    {product.quantidade.toLocaleString("pt-BR")} un.
                    <span className="block text-caption text-muted">
                      {product.lotes} × {product.quantidadeLote.toLocaleString("pt-BR")}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">{formatBRL(product.valorUnitario)}</td>
                  <td className="py-2.5 font-semibold">{formatBRL(product.valorTotal)}</td>
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
              {payload.pagamento.desconto ? ` · desconto ${formatBRL(payload.pagamento.desconto)}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted">entrega</dt>
            <dd className="font-semibold">{payload.entrega.endereco ? `${payload.entrega.tipo}: ${addressText(payload.entrega.endereco)}` : payload.entrega.tipo}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">precoTotal</dt>
            <dd className="text-lg font-black">{formatBRL(payload.precoTotal)}</dd>
          </div>
        </dl>
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

function OrderResult({ result, onCancelled }: { result: Extract<Result, { mode: "order" }>; onCancelled: () => void }) {
  const method = PAYMENT_METHODS[result.method];
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
            Total de {formatBRL(result.quote.totals.total)} no {method.label}. Pagamento pendente: a Padrão Color envia as instruções de pagamento pelo e-mail e telefone do seu cadastro. A produção começa depois da confirmação.
          </p>
          <p className="mt-3 text-sm text-muted">Se a arte ainda não foi enviada, mande pelo pedido em Meus pedidos.</p>
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

export default function CheckoutView({ ordersEnabled }: { ordersEnabled: boolean }) {
  const { lines, subtotal, reseller, pricing, clear } = useCart();
  const customer = useCustomer();
  const logged = customer.status === "customer" || customer.status === "reseller";
  const [authTab, setAuthTab] = useState<"entrar" | "criar">("entrar");
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [deliveryKind, setDeliveryKind] = useState<DeliveryChoice["kind"]>("cadastro");
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY_ADDRESS);
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [deliveryDone, setDeliveryDone] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [error, setError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<LineError[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [checkOrders, setCheckOrders] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Endereço do cadastro e saldo (GET /api/conta/resumo) da conta logada.
  const customerId = logged ? customer.id : undefined;
  useEffect(() => {
    if (!customerId) return;
    let alive = true;
    getJson<Omit<AccountSummary, "customerId">>("/api/conta/resumo").then((reply) => {
      if (!alive) return;
      if (reply.ok) setSummary({ ...reply.data, customerId });
      else if (reply.status === 401) setCustomer({ status: "anonymous" });
      // Sem o cadastro agora: segue com outro endereço ou retirada.
      else setSummary({ customerId, document: "", address: null, balance: null, blocked: null });
    });
    return () => {
      alive = false;
    };
  }, [customerId]);

  const account = summary && summary.customerId === customerId ? summary : null;
  const registered = account?.address && !addressProblem(account.address) ? account.address : null;
  const kind: DeliveryChoice["kind"] = deliveryKind === "cadastro" && account && !registered ? "outro" : deliveryKind;
  const delivery: DeliveryChoice = kind === "outro" ? { kind, address } : { kind };
  const totals = orderTotals(lines, payment);
  const step = !logged ? 1 : !deliveryDone ? 2 : 3;

  if (result?.mode === "simulation") return <SimulationResult payload={result.payload} onBack={() => setResult(null)} />;
  if (result?.mode === "order") return <OrderResult result={result} onCancelled={() => setResult({ ...result, cancelled: true })} />;

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
    if (cep.replace(/\D/g, "").length !== 8) {
      setCepStatus(null);
      return;
    }
    setCepStatus("Buscando o endereço…");
    const found = await lookupCep(cep);
    if (!found) {
      setCepStatus("CEP não encontrado. Preencha o endereço.");
      return;
    }
    setAddress((current) => ({ ...current, logradouro: found.logradouro || current.logradouro, bairro: found.bairro || current.bairro, cidade: found.cidade || current.cidade, estado: found.estado || current.estado }));
    setCepStatus("Endereço encontrado. Confira e informe o número.");
  };

  const confirmDelivery = () => {
    const problem = kind === "outro" ? addressProblem(address) : kind === "cadastro" && !registered ? "Carregando o endereço do cadastro…" : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setDeliveryDone(true);
  };

  const submit = async (expectedTotal: number) => {
    setBusy(true);
    setError(null);
    setItemErrors([]);
    setCheckOrders(false);
    const reply = await postJson<OrderReply>("/api/pedidos", {
      items: lines.map((line) => toOrderItem(line.item, line.unitPrice)),
      payment,
      delivery,
      expectedTotal,
    });
    setBusy(false);
    if (reply.ok) {
      setQuote(null);
      if (reply.data.mode === "simulation") {
        setResult({ mode: "simulation", payload: reply.data.payload, quote: reply.data.quote });
        return;
      }
      setResult({ mode: "order", order: reply.data.order, quote: reply.data.quote, method: payment, cancelled: false });
      clear();
      return;
    }
    setError(reply.error);
    if (reply.status === 401) setCustomer({ status: "anonymous" });
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

  const deliveryHint = !deliveryDone
    ? "Escolha onde receber o pedido."
    : kind === "retirada"
      ? `Retirada na Padrão Color · ${STORE.address}`
      : kind === "outro"
        ? addressText(address)
        : registered
          ? addressText(registered)
          : "";

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
                <FormAlert tone="success" className="mb-4">
                  {authInfo}
                </FormAlert>
              )}
              {authTab === "entrar" ? (
                <LoginForm onSignup={() => setAuthTab("criar")} />
              ) : (
                <SignupForm
                  onSuccess={({ loggedIn, message }) => {
                    if (loggedIn) return;
                    setAuthTab("entrar");
                    setAuthInfo(message ?? "Conta criada! Entre para continuar.");
                  }}
                />
              )}
            </>
          )}
        </Step>

        <Step n={2} title="Entrega" done={logged && deliveryDone} active={step === 2} hint={logged ? deliveryHint : "Finalize a identificação para avançar."} onEdit={() => setDeliveryDone(false)}>
          <fieldset className="space-y-2">
            <legend className="sr-only">Como receber o pedido</legend>
            {(!account || registered) && (
              <Option name="entrega" checked={kind === "cadastro"} onSelect={() => setDeliveryKind("cadastro")} title="Entregar no endereço do cadastro">
                {registered ? addressText(registered) : "Carregando o endereço…"}
              </Option>
            )}
            <Option name="entrega" checked={kind === "outro"} onSelect={() => setDeliveryKind("outro")} title="Entregar em outro endereço" />
            {kind === "outro" && (
              <div className="grid gap-4 rounded-thumb border border-line p-4 md:grid-cols-2">
                <TextField label="CEP" value={address.cep} onChange={onCep} hint={cepStatus ?? undefined} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" />
                <TextField label="Rua" value={address.logradouro} onChange={(value) => setAddress((a) => ({ ...a, logradouro: value }))} autoComplete="address-line1" />
                <TextField label="Número" value={address.numero} onChange={(value) => setAddress((a) => ({ ...a, numero: value }))} autoComplete="address-line2" />
                <TextField label="Complemento (opcional)" value={address.complemento} onChange={(value) => setAddress((a) => ({ ...a, complemento: value }))} autoComplete="address-line3" />
                <TextField label="Bairro" value={address.bairro} onChange={(value) => setAddress((a) => ({ ...a, bairro: value }))} autoComplete="address-level3" />
                <TextField label="Cidade" value={address.cidade} onChange={(value) => setAddress((a) => ({ ...a, cidade: value }))} autoComplete="address-level2" />
                <UfSelect value={address.estado} onChange={(value) => setAddress((a) => ({ ...a, estado: value }))} />
              </div>
            )}
            <Option name="entrega" checked={kind === "retirada"} onSelect={() => setDeliveryKind("retirada")} title="Retirar na Padrão Color">
              {STORE.address} · {STORE.hours}
            </Option>
          </fieldset>
          <p className="mt-3 text-caption text-muted">O frete é combinado com o atendimento depois do pedido (a API ainda não calcula frete).</p>
          {error && step === 2 && <FormAlert className="mt-4">{error}</FormAlert>}
          <Button variant="buy" size="md" block className="mt-5" onClick={confirmDelivery}>
            Continuar
          </Button>
        </Step>

        <Step n={3} title="Pagamento" done={false} active={step === 3} hint="Escolha a entrega para avançar.">
          <fieldset className="space-y-2">
            <legend className="sr-only">Forma de pagamento</legend>
            {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((value) => (
              <Option
                key={value}
                name="pagamento"
                checked={payment === value}
                onSelect={() => {
                  setPayment(value);
                  setQuote(null);
                }}
                title={PAYMENT_METHODS[value].label}
              >
                {PAYMENT_METHODS[value].hint}
              </Option>
            ))}
          </fieldset>
          {account?.balance ? (
            <p className="mt-4 rounded-thumb bg-mist p-3 text-caption">
              {account.balance > 0 ? (
                <>
                  Você tem <strong>{formatBRL(account.balance)}</strong> de crédito na conta corrente
                </>
              ) : (
                <>
                  Sua conta corrente tem saldo devedor de <strong>{formatBRL(Math.abs(account.balance))}</strong>
                </>
              )}
              {account.blocked ? ` (${formatBRL(account.blocked)} bloqueado)` : ""}. O uso do crédito é combinado com o atendimento: ele não entra neste total.
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
                Total na tela: {formatBRL(totals.total)} · novo total: <strong className="text-ink">{formatBRL(quote.totals.total)}</strong>
              </p>
              <Button variant="dark" size="sm" className="mt-3" loading={busy} onClick={() => submit(quote.totals.total)}>
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
          {!quote && (
            <Button variant="buy" size="md" block className="mt-4" loading={busy} disabled={pricing} onClick={() => submit(totals.total)}>
              {pricing ? "Atualizando preços…" : ordersEnabled ? `Finalizar pedido · ${formatBRL(totals.total)}` : `Simular pedido · ${formatBRL(totals.total)}`}
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
          {totals.discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Desconto no PIX</dt>
              <dd className="font-semibold text-price-sm">− {formatBRL(totals.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">Entrega</dt>
            <dd>{kind === "retirada" && deliveryDone ? "Retirada (sem frete)" : "A combinar"}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-base">
            <dt className="font-bold">Total</dt>
            <dd className="font-black">{formatBRL(totals.total)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
