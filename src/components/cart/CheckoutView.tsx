"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { IconCheck } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { formatBRL, quantityLabel } from "@/lib/format";
import { PIX_DISCOUNT, pixPrice } from "@/lib/pricing";
import { CartThumb } from "./CartThumb";
import { useCart } from "./CartProvider";

type Address = { cep: string; street: string; number: string; district: string; city: string; uf: string };

function Field({ label, required = false, className, ...input }: { label: string; required?: boolean; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-caption font-semibold">
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      <input
        {...input}
        id={id}
        required={required}
        className="mt-1 h-11 w-full rounded-control border border-line-strong bg-white px-3.5 text-[15px] transition-colors placeholder:text-muted focus:border-ink aria-invalid:border-coral-700"
      />
    </div>
  );
}

function Step({ n, title, done, active, hint, error, children }: { n: number; title: string; done: boolean; active: boolean; hint: string; error: string | null; children: ReactNode }) {
  return (
    <section aria-current={active ? "step" : undefined} className={cx("rounded-control bg-white p-6 transition-opacity", !active && !done && "opacity-70")}>
      <h2 className="flex items-center gap-2.5 text-lg font-bold">
        <span className={cx("grid size-6 place-items-center rounded-full text-[12px] text-white", done || active ? "bg-ink" : "bg-muted")}>
          {done ? <IconCheck aria-hidden className="size-3.5" strokeWidth={2.6} /> : n}
        </span>
        {title}
        {done && <span className="sr-only">(concluído)</span>}
      </h2>
      {active ? <div className="mt-4">{children}</div> : <p className="mt-2 text-caption text-muted">{hint}</p>}
      {active && error && (
        <p role="alert" className="mt-4 rounded-thumb bg-coral-50 p-3 text-sm font-semibold text-coral-700">
          {error}
        </p>
      )}
    </section>
  );
}

export default function CheckoutView() {
  const { items, subtotal, clear } = useCart();
  const [step, setStep] = useState(1);
  const [contact, setContact] = useState({ email: "", name: "", phone: "" });
  const [address, setAddress] = useState<Address>({ cep: "", street: "", number: "", district: "", city: "", uf: "" });
  const [payment, setPayment] = useState<"pix" | "cartao" | "boleto">("pix");
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ id: string; total: number; count: number } | null>(null);
  const total = payment === "pix" ? pixPrice(subtotal) : subtotal;

  if (placed) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-ink text-white">
          <IconCheck aria-hidden className="size-8" strokeWidth={2.4} />
        </span>
        <h1 className="mt-6 text-3xl font-bold">Pedido de demonstração registrado</h1>
        <p className="mt-3 text-ink/75">
          Pedido {placed.id} · {placed.count} {placed.count === 1 ? "item" : "itens"} · {formatBRL(placed.total)}. Este checkout é uma prévia do novo site: nenhum pagamento foi processado e nada foi enviado para produção.
        </p>
        <Button href="/" variant="buy" size="md" className="mt-8">
          Voltar para a loja
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-2xl font-bold">Seu carrinho está vazio.</h1>
        <Button href="/produtos" variant="buy" size="md" className="mt-6">
          Ver produtos
        </Button>
      </div>
    );
  }

  const lookupCep = async (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const data = await (await fetch(`https://viacep.com.br/ws/${digits}/json/`)).json();
      if (!data.erro) setAddress((a) => ({ ...a, street: data.logradouro ?? "", district: data.bairro ?? "", city: data.localidade ?? "", uf: data.uf ?? "" }));
    } catch {
      setError("Não foi possível consultar o CEP. Preencha o endereço manualmente.");
    }
  };

  const nextFromContact = () => {
    if (!/^\S+@\S+\.\S+$/.test(contact.email) || contact.name.trim().length < 3) {
      setError("Informe um e-mail válido e o seu nome completo.");
      return;
    }
    setError(null);
    setStep(2);
  };

  const nextFromAddress = () => {
    if (address.cep.replace(/\D/g, "").length !== 8 || !address.street || !address.number || !address.city) {
      setError("Preencha CEP, rua, número e cidade.");
      return;
    }
    setError(null);
    setStep(3);
  };

  const place = () => {
    const count = items.reduce((s, i) => s + i.quantity, 0);
    setPlaced({ id: `#${Date.now().toString().slice(-6)}`, total, count });
    clear();
  };

  return (
    <div className="mx-auto grid max-w-[1200px] gap-5 px-5 py-8 lg:grid-cols-3">
      <h1 className="sr-only">Finalizar compra</h1>
      <div className="space-y-5">
        <Step n={1} title="Identificação" done={step > 1} active={step === 1} hint={contact.email} error={error}>
          <p className="mb-4 text-caption text-ink/75">Usamos o seu e-mail para identificar a compra e enviar notificações do pedido.</p>
          <div className="space-y-3">
            <Field label="E-mail" required type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="voce@empresa.com.br" />
            <Field label="Nome completo" required autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <Field label="Celular" type="tel" inputMode="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="(21) 90000-0000" />
          </div>
          <Button variant="buy" size="md" block className="mt-5" onClick={nextFromContact}>
            Avançar
          </Button>
          <Button href="/produtos" variant="outline" size="sm" block className="mt-2">
            Continuar comprando
          </Button>
        </Step>
      </div>

      <div className="space-y-5">
        <Step
          n={2}
          title="Endereço de entrega"
          done={step > 2}
          active={step === 2}
          error={error}
          hint={step > 2 ? `${address.street}, ${address.number} · ${address.city}/${address.uf}` : "Finalize a identificação para avançar."}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="CEP"
              required
              className="col-span-2"
              inputMode="numeric"
              autoComplete="postal-code"
              value={address.cep}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                const cep = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
                setAddress({ ...address, cep });
                if (d.length === 8) lookupCep(d);
              }}
              placeholder="00000-000"
            />
            <Field label="Rua" required className="col-span-2" autoComplete="address-line1" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
            <Field label="Número" required autoComplete="address-line2" value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} />
            <Field label="Bairro" autoComplete="address-level3" value={address.district} onChange={(e) => setAddress({ ...address, district: e.target.value })} />
            <Field label="Cidade" required autoComplete="address-level2" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
            <Field label="UF" autoComplete="address-level1" value={address.uf} maxLength={2} onChange={(e) => setAddress({ ...address, uf: e.target.value.toUpperCase() })} />
          </div>
          <Button variant="buy" size="md" block className="mt-5" onClick={nextFromAddress}>
            Avançar
          </Button>
        </Step>

        <Step n={3} title="Pagamento" done={false} active={step === 3} error={error} hint="Finalize o cadastro e o endereço para avançar.">
          <fieldset className="space-y-2">
            <legend className="sr-only">Forma de pagamento</legend>
            {(
              [
                ["pix", "Pix", `Pagamento instantâneo com ${Math.round(PIX_DISCOUNT * 100)}% de desconto`],
                ["cartao", "Cartão de crédito", "Condições definidas na integração de pagamento"],
                ["boleto", "Boleto bancário", "Pagamento bancário"],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className={cx("flex items-center gap-3 rounded-thumb border p-3.5 transition-colors", payment === value ? "border-ink bg-mist" : "border-line")}>
                <input type="radio" name="pagamento" checked={payment === value} onChange={() => setPayment(value)} className="size-4 accent-ink" />
                <span>
                  <span className="block text-[15px] font-semibold">{label}</span>
                  <span className="text-caption text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="mt-4 rounded-thumb bg-sun-50 p-3 text-caption text-ink/80">Demonstração do novo site: o pagamento não é processado.</p>
          <Button variant="buy" size="md" block className="mt-4" onClick={place}>
            Finalizar pedido
          </Button>
        </Step>
      </div>

      <aside className="h-fit rounded-control bg-white p-6" aria-label="Resumo do pedido">
        <h2 className="flex items-center gap-2.5 text-lg font-bold">
          <span className="grid size-6 place-items-center rounded-full bg-ink text-[12px] text-white">4</span>
          Revise seu pedido
        </h2>
        <ul className="mt-5 space-y-4">
          {items.map((item) => (
            <li key={item.key} className="flex gap-3">
              <div className="relative">
                <CartThumb preview={item.preview} image={item.image} name={item.name} className="size-16" />
                <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
                  {item.quantity}
                  <span className="sr-only"> unidades</span>
                </span>
              </div>
              <div className="min-w-0 flex-1 text-caption">
                <p className="line-clamp-2 font-semibold">{item.name}</p>
                <p className="text-muted">{quantityLabel(item.setQty)}</p>
                {item.options["Texto da arte"] && <p className="text-muted">Texto: {item.options["Texto da arte"]}</p>}
              </div>
              <p className="text-caption font-semibold tabular-nums">{formatBRL(item.unitPrice * item.quantity)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-6 space-y-2 border-t border-line pt-4 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatBRL(subtotal)}</dd>
          </div>
          {payment === "pix" && (
            <div className="flex justify-between">
              <dt className="text-muted">Desconto no PIX</dt>
              <dd className="font-semibold text-price-sm">− {formatBRL(subtotal - total)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">Entrega</dt>
            <dd>{step > 2 ? "A combinar" : "Informe o CEP"}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-base">
            <dt className="font-bold">Total</dt>
            <dd className="font-black">{formatBRL(total)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
