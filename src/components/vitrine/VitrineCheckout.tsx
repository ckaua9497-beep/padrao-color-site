"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { itemFacts, quantityText, toOrderItem, useCart } from "@/components/cart/CartProvider";
import { CartThumb } from "@/components/cart/CartThumb";
import { loadPrintFile } from "@/components/product/gabarito/print-store";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import { formatCep, formatDocument, formatPhone, onlyDigits } from "@/lib/api/validation";
import { formatBRL } from "@/lib/format";
import { PIX_DISCOUNT, pixPrice } from "@/lib/pricing";
import type { OrderQuote } from "@/lib/multiloja/pedido";
import { nomeFrete, prazoFrete, type OpcaoFrete } from "@/lib/frete";
import type { PaymentKind } from "@/lib/multiloja/core";
import { readRef } from "./RefTracker";
import { track, trackingHeaders } from "@/lib/tracking";

/*
 * Fechamento do pedido na loja do lojista: dados, entrega (frete cotado pela API de frete da Padrão pelo CEP, com a embalagem
 * de cada produto), pagamento (Pix com desconto, boleto ou cartão) e resumo com os totais calculados pelo servidor. Ao confirmar, o pedido é criado, as artes
 * montadas no site (PDF no gabarito, guardado no navegador) sobem junto e o cliente vai para a página do pedido.
 * Sem pagamento online configurado, o pedido segue pronto para o WhatsApp da loja.
 */

type Props = { storeName: string; whatsapp: string | null; email: string | null };
type Method = PaymentKind;

const METHOD_INFO: Record<Method, { label: string; hint: string }> = {
  pix: { label: "Pix", hint: `${Math.round(PIX_DISCOUNT * 100)}% de desconto, aprovação na hora` },
  boleto: { label: "Boleto", hint: "Aprovação em até 2 dias úteis após o pagamento" },
  cartao: { label: "Cartão de crédito", hint: "Página segura de pagamento, em parcelas" },
};

const EMPTY_ADDRESS = { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "" };

/** Frete na cotação do servidor: formas de entrega da Padrão, frete fixo da loja, CEP faltando ou problema. */
type FreteInfo =
  | { modo: "cotado"; opcoes: OpcaoFrete[]; escolhida: number; estimado: boolean }
  | { modo: "erro"; mensagem: string; semMedida: string[] }
  | { modo: "fixo" }
  | { modo: "sem-cep" };

export default function VitrineCheckout({ storeName, whatsapp, email }: Props) {
  const router = useRouter();
  const { lines, subtotal, clear } = useCart();
  const [cliente, setCliente] = useState({ nome: "", email: "", telefone: "", documento: "" });
  const [entrega, setEntrega] = useState(EMPTY_ADDRESS);
  const [method, setMethod] = useState<Method>("pix");
  const [notes, setNotes] = useState("");
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [methods, setMethods] = useState<Method[]>([]);
  const [lineErrors, setLineErrors] = useState<{ key: string; error: string }[]>([]);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [step, setStep] = useState<"form" | "enviando" | "artes">("form");
  const [cepStatus, setCepStatus] = useState<"" | "buscando" | "erro">("");
  const [frete, setFrete] = useState<FreteInfo | null>(null);
  const [freteServico, setFreteServico] = useState<number | null>(null);
  const [cotando, setCotando] = useState(false);
  const [requote, setRequote] = useState(0);
  const cepDigits = onlyDigits(entrega.cep).length === 8 ? onlyDigits(entrega.cep) : "";

  const items = useMemo(() => lines.map(({ item, unitPrice }) => toOrderItem(item, unitPrice)), [lines]);

  // Rastreamento: abriu o checkout.
  useEffect(() => {
    track("checkout_inicio");
  }, []);
  const itemsKey = JSON.stringify(items);

  // Cotação do servidor: preço da loja, desconto do Pix e frete (API de frete da Padrão, pelo CEP). Refaz quando o carrinho,
  // a forma de pagamento, o CEP ou a forma de entrega mudam.
  useEffect(() => {
    const cartItems = JSON.parse(itemsKey) as unknown[];
    if (!cartItems.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => setCotando(true), 150);
    fetch("/api/multiloja/pedido?cotar=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cartItems, pagamento: method, cep: cepDigits, freteServico }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { ok?: boolean; quote?: OrderQuote; frete?: FreteInfo; online?: boolean; metodos?: Method[]; metodo?: Method; errors?: { key: string; error: string }[] }) => {
        if (data.ok && data.quote) {
          setQuote(data.quote);
          setFrete(data.frete ?? null);
          // A mais barata vem escolhida; a escolha do cliente é mantida enquanto ela existir.
          if (data.frete?.modo === "cotado" && data.frete.escolhida !== freteServico) setFreteServico(data.frete.escolhida);
          setOnline(Boolean(data.online));
          setMethods(data.metodos ?? []);
          // O servidor ajusta a forma quando a escolhida não está disponível.
          if (data.metodo && data.metodo !== method) setMethod(data.metodo);
          setLineErrors([]);
        } else setLineErrors(data.errors ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timer);
        if (!controller.signal.aborted) setCotando(false);
      });
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [itemsKey, method, cepDigits, freteServico, requote]);

  if (lines.length === 0 && step === "form") {
    return (
      <div className="rounded-card border border-line-strong bg-white p-12 text-center">
        <p className="text-xl font-semibold">Seu carrinho está vazio.</p>
        <Button href="/produtos" size="md" className="mt-6">
          Ver produtos
        </Button>
      </div>
    );
  }

  const lookupCep = async (cep: string) => {
    const digits = onlyDigits(cep);
    if (digits.length !== 8) return;
    setCepStatus("buscando");
    try {
      const data = (await (await fetch(`https://viacep.com.br/ws/${digits}/json/`)).json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) throw new Error("cep");
      setEntrega((e) => ({ ...e, logradouro: data.logradouro || e.logradouro, bairro: data.bairro || e.bairro, cidade: data.localidade || e.cidade, estado: data.uf || e.estado }));
      setCepStatus("");
    } catch {
      setCepStatus("erro");
    }
  };

  const whatsappText = () =>
    [
      `Olá, ${storeName}! Quero fazer este pedido:`,
      "",
      ...lines.map(({ item, total }, i) => {
        const facts = itemFacts(item);
        const options = Object.entries(item.options)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ");
        return [`${i + 1}. ${item.name} — ${quantityText(item)} — ${formatBRL(total)}`, options && `   ${options}`, facts.size && `   Medida: ${facts.size}`].filter(Boolean).join("\n");
      }),
      "",
      `Total: ${formatBRL(subtotal)}`,
      `Nome: ${cliente.nome}`,
      `Telefone: ${cliente.telefone}`,
      `Cidade/UF: ${entrega.cidade}/${entrega.estado}`,
    ].join("\n");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (online === false) {
      const text = whatsappText();
      window.open(whatsapp ? `https://wa.me/55${whatsapp}?text=${encodeURIComponent(text)}` : `mailto:${email ?? ""}?subject=${encodeURIComponent(`Pedido – ${storeName}`)}&body=${encodeURIComponent(text)}`, "_blank", "noopener");
      return;
    }
    if (!quote) return;
    setStep("enviando");
    const response = await fetch("/api/multiloja/pedido", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...trackingHeaders() },
      body: JSON.stringify({ items, cliente, entrega, pagamento: method, expectedTotal: quote.total, freteServico: frete?.modo === "cotado" ? freteServico : null, ref: readRef(), observacoes: notes }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string; field?: string; quote?: OrderQuote; codigo?: string; token?: string; url?: string } | null;

    if (response?.status === 409 && data?.quote) {
      setQuote(data.quote);
      setRequote((n) => n + 1);
      setStep("form");
      setError({ message: data.error ?? "O valor mudou. Confira e confirme de novo." });
      return;
    }
    if (!response || !data?.url || !data.codigo) {
      setStep("form");
      setError({ message: data?.error ?? "Não foi possível fechar o pedido agora. Tente de novo.", field: data?.field });
      return;
    }

    // Artes montadas no site: sobem para o pedido (o cliente pode reenviar na página do pedido se falhar).
    setStep("artes");
    const token = data.token ?? new URL(data.url, window.location.origin).searchParams.get("t") ?? "";
    await Promise.all(
      lines.map(async ({ item }, posicao) => {
        if (!item.printFile) return;
        const file = await loadPrintFile(item.printFile.id).catch(() => null);
        if (!file) return;
        const form = new FormData();
        form.append("arquivo", new File([file.blob], item.printFile.name.endsWith(".pdf") ? item.printFile.name : `${item.printFile.name}.pdf`, { type: "application/pdf" }));
        await fetch(`/api/multiloja/pedido/${data.codigo}/arte?t=${encodeURIComponent(token)}&item=${posicao}`, { method: "POST", body: form }).catch(() => undefined);
      }),
    );
    clear();
    router.push(data.url);
  };

  const set = <K extends keyof typeof cliente>(key: K) => (value: string) => setCliente((c) => ({ ...c, [key]: value }));
  const setAddr = <K extends keyof typeof entrega>(key: K) => (value: string) => setEntrega((e) => ({ ...e, [key]: value }));
  const fieldError = (field: string) => (error?.field === field ? error.message : null);
  const busy = step !== "form";

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_420px]" noValidate>
      <div className="space-y-6">
        <section className="space-y-5 rounded-card border border-line-strong bg-white p-6" aria-labelledby="dados">
          <h2 id="dados" className="text-xl font-bold">
            1. Seus dados
          </h2>
          <TextField label="Nome completo" value={cliente.nome} onChange={set("nome")} autoComplete="name" maxLength={120} error={fieldError("nome")} />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="E-mail" type="email" value={cliente.email} onChange={set("email")} autoComplete="email" error={fieldError("email")} hint="Enviamos o link do pedido para ele." />
            <TextField label="Celular / WhatsApp" value={cliente.telefone} onChange={(v) => set("telefone")(formatPhone(v))} autoComplete="tel" inputMode="tel" error={fieldError("telefone")} />
          </div>
          <TextField label="CPF ou CNPJ" value={cliente.documento} onChange={(v) => set("documento")(formatDocument(v))} inputMode="numeric" error={fieldError("documento")} hint="Para a nota fiscal e o Pix." />
        </section>

        <section className="space-y-5 rounded-card border border-line-strong bg-white p-6" aria-labelledby="entrega">
          <h2 id="entrega" className="text-xl font-bold">
            2. Entrega
          </h2>
          {fieldError("entrega") && (
            <p role="alert" className="text-sm font-semibold text-coral-700">
              {fieldError("entrega")}
            </p>
          )}
          <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
            <TextField
              label="CEP"
              value={entrega.cep}
              onChange={(v) => {
                const formatted = formatCep(v);
                setAddr("cep")(formatted);
                if (onlyDigits(formatted).length === 8) void lookupCep(formatted);
              }}
              inputMode="numeric"
              autoComplete="postal-code"
              hint={cepStatus === "buscando" ? "Buscando endereço…" : cepStatus === "erro" ? "CEP não encontrado: preencha à mão." : undefined}
            />
            <TextField label="Rua / avenida" value={entrega.logradouro} onChange={setAddr("logradouro")} autoComplete="address-line1" maxLength={120} />
          </div>
          <div className="grid gap-5 sm:grid-cols-[140px_1fr_1fr]">
            <TextField label="Número" value={entrega.numero} onChange={setAddr("numero")} maxLength={20} />
            <TextField label="Complemento" value={entrega.complemento} onChange={setAddr("complemento")} maxLength={80} />
            <TextField label="Bairro" value={entrega.bairro} onChange={setAddr("bairro")} maxLength={80} />
          </div>
          <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
            <TextField label="Cidade" value={entrega.cidade} onChange={setAddr("cidade")} autoComplete="address-level2" maxLength={80} />
            <TextField label="UF" value={entrega.estado} onChange={(v) => setAddr("estado")(v.toUpperCase().slice(0, 2))} autoComplete="address-level1" maxLength={2} />
          </div>
          {frete?.modo !== "fixo" && (
            <fieldset className="space-y-3 border-t border-line pt-5" aria-busy={cotando || undefined}>
              <legend className="mb-3 text-[15px] font-bold">Forma de envio</legend>
              {!cepDigits ? (
                <p className="text-[15px] text-muted">Digite o CEP para ver as formas de entrega e o valor do frete.</p>
              ) : frete?.modo === "erro" ? (
                <div role="alert" className="rounded-control bg-coral-50 px-4 py-3 text-[15px]">
                  <p className="font-semibold text-coral-700">{frete.mensagem}</p>
                  {frete.semMedida.length > 0 && <p className="mt-1 text-sm text-ink/80">Sem medida de envio cadastrada: {frete.semMedida.join(", ")}.</p>}
                  {whatsapp && (
                    <a href={`https://wa.me/55${whatsapp}?text=${encodeURIComponent(whatsappText())}`} target="_blank" rel="noreferrer" className="mt-2 inline-block font-bold underline underline-offset-2">
                      Fechar o pedido pelo WhatsApp
                    </a>
                  )}
                </div>
              ) : frete?.modo === "cotado" ? (
                <div role="radiogroup" aria-label="Forma de envio" className="grid gap-2">
                  {frete.opcoes.map((o) => (
                    <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-control border border-line p-4 has-[:checked]:border-ink has-[:checked]:ring-2 has-[:checked]:ring-ink">
                      <input type="radio" name="frete" value={o.id} checked={freteServico === o.id} onChange={() => setFreteServico(o.id)} className="accent-ink" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{nomeFrete(o)}</span>
                        <span className="text-caption text-muted">Chega em {prazoFrete(o)} depois que o pedido fica pronto</span>
                      </span>
                      <span className="font-bold tabular-nums">{quote?.freteGratis && freteServico === o.id ? "Grátis" : formatBRL(o.preco)}</span>
                    </label>
                  ))}
                  <p className="text-caption text-muted">Frete calculado pela Padrão Color com a embalagem de cada produto.</p>
                </div>
              ) : (
                <p className="text-[15px] text-muted">Calculando o frete…</p>
              )}
            </fieldset>
          )}
        </section>

        <section className="space-y-4 rounded-card border border-line-strong bg-white p-6" aria-labelledby="pagamento">
          <h2 id="pagamento" className="text-xl font-bold">
            3. Pagamento
          </h2>
          {online === false ? (
            <p className="text-[15px] text-muted">Esta loja ainda fecha os pedidos pelo WhatsApp: a forma de pagamento é combinada na conversa.</p>
          ) : (
            <div role="radiogroup" aria-label="Forma de pagamento" className="grid gap-3 sm:grid-cols-3">
              {methods.map((value) => [value, METHOD_INFO[value].label, METHOD_INFO[value].hint] as const).map(([value, label, hint]) => (
                <label key={value} className="flex cursor-pointer items-start gap-3 rounded-control border border-line p-4 has-[:checked]:border-ink has-[:checked]:ring-2 has-[:checked]:ring-ink">
                  <input type="radio" name="pagamento" value={value} checked={method === value} onChange={() => setMethod(value)} className="mt-1 accent-ink" />
                  <span>
                    <span className="block font-bold">{label}</span>
                    <span className="text-caption text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div>
            <label htmlFor="obs" className="mb-1.5 block text-[15px] font-bold">
              Observações (opcional)
            </label>
            <textarea id="obs" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} className="w-full rounded-control border border-line px-[18px] py-3 text-body focus:border-ink" />
          </div>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-card border border-line-strong bg-white p-5 lg:sticky lg:top-28">
        <h2 className="text-lg font-bold">Resumo</h2>
        <ul className="divide-y divide-line">
          {lines.map(({ item, total }) => {
            const problem = lineErrors.find((e) => e.key === item.key);
            return (
              <li key={item.key} className="flex gap-3 py-3">
                <CartThumb preview={item.preview} image={item.image} name={item.name} className="size-16 shrink-0" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="line-clamp-2 font-semibold">{item.name}</p>
                  <p className="text-muted">{quantityText(item)}</p>
                  {item.printFile && <p className="text-caption text-muted">Arte no gabarito: {item.printFile.name}</p>}
                  {problem && <p className="mt-1 text-caption font-semibold text-coral-700">{problem.error}</p>}
                </div>
                <p className="text-sm font-bold tabular-nums">{formatBRL(total)}</p>
              </li>
            );
          })}
        </ul>
        <dl className="space-y-1.5 border-t border-line pt-4 text-[15px] tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted">Produtos</dt>
            <dd>{formatBRL(quote?.subtotal ?? subtotal)}</dd>
          </div>
          {quote && quote.desconto > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Desconto Pix</dt>
              <dd>− {formatBRL(quote.desconto)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted">
              Frete
              {frete?.modo === "cotado" && <span className="block text-caption">{nomeFrete(frete.opcoes.find((o) => o.id === freteServico) ?? frete.opcoes[0])}</span>}
            </dt>
            <dd>{!quote || cotando ? "…" : frete?.modo === "sem-cep" ? "Informe o CEP" : frete?.modo === "erro" ? "—" : quote.frete > 0 ? formatBRL(quote.frete) : "Grátis"}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <dt className="font-bold">Total</dt>
            <dd className="text-2xl font-black">{formatBRL(quote?.total ?? (method === "pix" ? pixPrice(subtotal) : subtotal))}</dd>
          </div>
        </dl>
        {error && !error.field && (
          <p role="alert" className="rounded-control bg-coral-50 px-4 py-3 text-sm font-semibold text-coral-700">
            {error.message}
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy} disabled={busy || lineErrors.length > 0 || (online !== false && (!quote || cotando || frete?.modo === "erro" || frete?.modo === "sem-cep"))}>
          {online === false ? (whatsapp ? "Enviar pedido pelo WhatsApp" : "Enviar pedido por e-mail") : method === "pix" ? "Gerar Pix" : method === "boleto" ? "Gerar boleto" : "Ir para o pagamento"}
        </Button>
        <p className={cx("text-caption text-muted", step === "artes" && "font-semibold text-ink")} aria-live="polite">
          {step === "artes" ? "Enviando as artes do pedido…" : "Seus dados são usados só para este pedido e a entrega."}
        </p>
      </aside>
    </form>
  );
}
