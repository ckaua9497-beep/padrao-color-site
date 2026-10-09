"use client";

import { useState, type FormEvent } from "react";
import { itemFacts, quantityText, useCart } from "@/components/cart/CartProvider";
import { CartThumb } from "@/components/cart/CartThumb";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { formatBRL } from "@/lib/format";
import { pixPrice } from "@/lib/pricing";

/*
 * Fechamento do pedido da loja enquanto o pagamento online da multiloja não entra: o cliente revisa os itens,
 * informa nome, telefone e cidade, e o pedido segue pronto no WhatsApp da loja (ou por e-mail).
 */

type Props = { storeName: string; whatsapp: string | null; email: string | null };

export default function VitrineCheckout({ storeName, whatsapp, email }: Props) {
  const { lines, subtotal } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (lines.length === 0) {
    return (
      <div className="rounded-card border border-line-strong bg-white p-12 text-center">
        <p className="text-xl font-semibold">Seu carrinho está vazio.</p>
        <Button href="/produtos" size="md" className="mt-6">
          Ver produtos
        </Button>
      </div>
    );
  }

  const message = () => {
    const rows = lines.map(({ item, total }, i) => {
      const facts = itemFacts(item);
      const options = Object.entries(item.options)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
      return [
        `${i + 1}. ${item.name} — ${quantityText(item)} — ${formatBRL(total)}`,
        options && `   ${options}`,
        facts.size && `   Medida: ${facts.size}`,
        facts.express && "   Prazo expresso",
        item.artName && `   Arte: ${item.artName} (envio o arquivo aqui na conversa)`,
      ]
        .filter(Boolean)
        .join("\n");
    });
    return [
      `Olá, ${storeName}! Quero fazer este pedido:`,
      "",
      ...rows,
      "",
      `Total: ${formatBRL(subtotal)} (${formatBRL(pixPrice(subtotal))} no PIX)`,
      "",
      `Nome: ${name.trim()}`,
      `Telefone: ${phone.trim()}`,
      `Cidade/UF: ${city.trim()}`,
      ...(notes.trim() ? [`Observações: ${notes.trim()}`] : []),
    ].join("\n");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || phone.replace(/\D/g, "").length < 10 || !city.trim()) {
      setError("Preencha nome, telefone com DDD e cidade.");
      return;
    }
    setError(null);
    const text = message();
    const url = whatsapp ? `https://wa.me/55${whatsapp}?text=${encodeURIComponent(text)}` : `mailto:${email ?? ""}?subject=${encodeURIComponent(`Pedido – ${storeName}`)}&body=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <form onSubmit={submit} className="space-y-5 rounded-card border border-line-strong bg-white p-6" noValidate>
        <h2 className="text-xl font-bold">Seus dados</h2>
        <TextField label="Nome completo" value={name} onChange={setName} autoComplete="name" required maxLength={80} />
        <TextField label="Telefone / WhatsApp" value={phone} onChange={setPhone} autoComplete="tel" inputMode="tel" required placeholder="(00) 00000-0000" />
        <TextField label="Cidade / UF" value={city} onChange={setCity} autoComplete="address-level2" required placeholder="Rio de Janeiro / RJ" maxLength={60} />
        <div>
          <label htmlFor="obs" className="mb-1.5 block text-[15px] font-bold">
            Observações (opcional)
          </label>
          <textarea id="obs" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} className="w-full rounded-control border border-line px-[18px] py-3 text-body focus:border-ink" />
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-coral-700">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block>
          {whatsapp ? "Enviar pedido pelo WhatsApp" : "Enviar pedido por e-mail"}
        </Button>
        <p className="text-caption text-muted">
          A loja confirma valores, frete e forma de pagamento na conversa. Se você montou a arte aqui no site, envie o arquivo na mesma conversa.
        </p>
      </form>

      <aside className="h-fit rounded-card border border-line-strong bg-white p-5">
        <h2 className="text-lg font-bold">Resumo</h2>
        <ul className="mt-4 divide-y divide-line">
          {lines.map(({ item, total }) => (
            <li key={item.key} className="flex gap-3 py-3">
              <CartThumb preview={item.preview} image={item.image} name={item.name} className="size-16 shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="line-clamp-2 font-semibold">{item.name}</p>
                <p className="text-muted">{quantityText(item)}</p>
              </div>
              <p className="text-sm font-bold tabular-nums">{formatBRL(total)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-4 tabular-nums">
          <span className="text-muted">Total</span>
          <span className="text-xl font-black">{formatBRL(subtotal)}</span>
        </div>
        <p className="text-right text-caption font-semibold text-price-sm">{formatBRL(pixPrice(subtotal))} no PIX</p>
      </aside>
    </div>
  );
}
