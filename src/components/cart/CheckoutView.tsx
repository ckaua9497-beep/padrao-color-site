"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { formatBRL, quantityLabel } from "@/lib/format";
import { CartThumb } from "./CartDrawer";
import { useCart } from "./CartProvider";

type Address = { cep: string; street: string; number: string; district: string; city: string; uf: string };

const input = "h-11 w-full rounded-[8px] border border-[#d0d0d0] bg-white px-3.5 text-[15px] outline-none transition-colors focus:border-ink";

function Step({ n, title, done, active, hint, children }: { n: number; title: string; done: boolean; active: boolean; hint: string; children: ReactNode }) {
  return (
    <section className={`rounded-[12px] bg-white p-6 transition-opacity ${active || done ? "" : "opacity-60"}`}>
      <h2 className="flex items-center gap-2.5 text-lg font-bold">
        <span className={`grid size-6 place-items-center rounded-full text-[12px] text-white ${done ? "bg-[#1db954]" : active ? "bg-ink" : "bg-subtle"}`}>{done ? "✓" : n}</span>
        {title}
      </h2>
      {active ? <div className="mt-4">{children}</div> : <p className="mt-2 text-[13px] text-muted">{hint}</p>}
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

  if (placed) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#1db954] text-3xl text-white">✓</span>
        <h1 className="mt-6 text-3xl font-bold">Pedido de demonstração registrado</h1>
        <p className="mt-3 text-ink/75">
          Pedido {placed.id} · {placed.count} {placed.count === 1 ? "item" : "itens"} · {formatBRL(placed.total)}. Este checkout é uma prévia do novo site: nenhum pagamento foi processado e nada foi enviado para produção.
        </p>
        <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-coral px-8 font-bold text-white hover:bg-coral-600">
          Voltar para a loja
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-2xl font-bold">Seu carrinho está vazio.</h1>
        <Link href="/produtos" className="mt-6 inline-flex h-12 items-center rounded-full bg-coral px-8 font-bold text-white hover:bg-coral-600">
          Ver produtos
        </Link>
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
    setPlaced({ id: `#${Date.now().toString().slice(-6)}`, total: subtotal, count });
    clear();
  };

  return (
    <div className="mx-auto grid max-w-[1200px] gap-5 px-5 py-8 lg:grid-cols-3">
      <div className="space-y-5">
        <Step n={1} title="Identificação" done={step > 1} active={step === 1} hint={contact.email}>
          <p className="mb-4 text-[13px] text-ink/75">Usamos o seu e-mail para identificar a compra e enviar notificações do pedido.</p>
          <div className="space-y-3">
            <label className="block text-[13px] font-semibold">
              E-mail *
              <input className={`${input} mt-1`} type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="voce@empresa.com.br" />
            </label>
            <label className="block text-[13px] font-semibold">
              Nome completo *
              <input className={`${input} mt-1`} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            </label>
            <label className="block text-[13px] font-semibold">
              Celular
              <input className={`${input} mt-1`} inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="(21) 90000-0000" />
            </label>
          </div>
          <button type="button" onClick={nextFromContact} className="mt-5 h-12 w-full rounded-[8px] bg-coral font-bold text-white hover:bg-coral-600">
            Avançar
          </button>
          <Link href="/produtos" className="mt-2 flex h-12 w-full items-center justify-center rounded-[8px] border border-[#999] font-bold text-[#777] hover:border-ink hover:text-ink">
            Continuar comprando
          </Link>
        </Step>
      </div>

      <div className="space-y-5">
        <Step n={2} title="Endereço de entrega" done={step > 2} active={step === 2} hint={step > 2 ? `${address.street}, ${address.number} · ${address.city}/${address.uf}` : "Finalize a identificação para avançar..."}>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block text-[13px] font-semibold">
              CEP *
              <input
                className={`${input} mt-1`}
                inputMode="numeric"
                value={address.cep}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                  const cep = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
                  setAddress({ ...address, cep });
                  if (d.length === 8) lookupCep(d);
                }}
                placeholder="00000-000"
              />
            </label>
            <label className="col-span-2 block text-[13px] font-semibold">
              Rua *
              <input className={`${input} mt-1`} value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
            </label>
            <label className="block text-[13px] font-semibold">
              Número *
              <input className={`${input} mt-1`} value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} />
            </label>
            <label className="block text-[13px] font-semibold">
              Bairro
              <input className={`${input} mt-1`} value={address.district} onChange={(e) => setAddress({ ...address, district: e.target.value })} />
            </label>
            <label className="block text-[13px] font-semibold">
              Cidade *
              <input className={`${input} mt-1`} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
            </label>
            <label className="block text-[13px] font-semibold">
              UF
              <input className={`${input} mt-1`} value={address.uf} maxLength={2} onChange={(e) => setAddress({ ...address, uf: e.target.value.toUpperCase() })} />
            </label>
          </div>
          <button type="button" onClick={nextFromAddress} className="mt-5 h-12 w-full rounded-[8px] bg-coral font-bold text-white hover:bg-coral-600">
            Avançar
          </button>
        </Step>

        <Step n={3} title="Pagamento" done={false} active={step === 3} hint="Finalize o cadastro e o endereço para avançar...">
          <div className="space-y-2">
            {(
              [
                ["pix", "Pix", "Pagamento instantâneo"],
                ["cartao", "Cartão de crédito", "Condições definidas na integração de pagamento"],
                ["boleto", "Boleto bancário", "Pagamento bancário"],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-[10px] border p-3.5 transition-colors ${payment === value ? "border-ink bg-mist" : "border-line"}`}>
                <input type="radio" name="pagamento" checked={payment === value} onChange={() => setPayment(value)} className="size-4 accent-coral" />
                <span>
                  <span className="block text-[15px] font-semibold">{label}</span>
                  <span className="text-[12px] text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-4 rounded-[10px] bg-sun-50 p-3 text-[12px] text-ink/80">Demonstração do novo site: o pagamento não é processado.</p>
          <button type="button" onClick={place} className="mt-4 h-12 w-full rounded-[8px] bg-coral font-bold text-white hover:bg-coral-600">
            Finalizar pedido
          </button>
        </Step>
        {error && <p className="rounded-[10px] bg-coral-50 p-3 text-sm font-semibold text-coral-700">{error}</p>}
      </div>

      <aside className="h-fit rounded-[12px] bg-white p-6">
        <h2 className="flex items-center gap-2.5 text-lg font-bold">
          <span className="grid size-6 place-items-center rounded-full bg-ink text-[12px] text-white">4</span>
          Revise seu pedido
        </h2>
        <ul className="mt-5 space-y-4">
          {items.map((item) => (
            <li key={item.key} className="flex gap-3">
              <div className="relative">
                <CartThumb preview={item.preview} image={item.image} name={item.name} className="size-16" />
                <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-muted text-[11px] font-bold text-white">{item.quantity}</span>
              </div>
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="line-clamp-2 font-semibold">{item.name}</p>
                <p className="text-muted">{quantityLabel(item.setQty)}</p>
              </div>
              <p className="text-[13px] font-semibold">{formatBRL(item.unitPrice * item.quantity)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-6 space-y-2 border-t border-line pt-4 text-[14px]">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatBRL(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Entrega</dt>
            <dd>{step > 2 ? "A combinar" : "Informe o CEP"}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-base">
            <dt className="font-bold">Total</dt>
            <dd className="font-black text-[#1db954]">{formatBRL(subtotal)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
