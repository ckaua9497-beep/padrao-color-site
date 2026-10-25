"use client";

import { useEffect, useRef, useState } from "react";
import { IconBag, IconCheck, IconClose, IconCube, IconUpload } from "@/components/icons";
import { AccordionItem } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { IconButton } from "@/components/ui/IconButton";
import { OptionGroup } from "@/components/ui/OptionGroup";
import { Price } from "@/components/ui/Price";
import QtyStepper from "@/components/ui/QtyStepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";

/** Botão que entra em `loading` por 1,6 s ao clicar: mostra o spinner, o aria-busy e o bloqueio. */
export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  // Desmontou no meio do loading: cancela o timer.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const run = () => {
    setLoading(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLoading(false), 1600);
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="buy" loading={loading} onClick={run} icon={<IconBag className="size-5" />}>
        {loading ? "Adicionando…" : "Adicionar ao carrinho"}
      </Button>
      <Button variant="dark" size="sm" loading={loading} onClick={run}>
        Salvar
      </Button>
      <span className="text-caption text-muted" aria-live="polite">
        {loading ? "aria-busy=true, clique bloqueado" : "Clique para simular o envio"}
      </span>
    </div>
  );
}

const SIZES = ["9 × 5 cm", "8,5 × 5,5 cm", "10 × 7 cm", "Personalizado"];
const PAPERS = [
  { value: "Couchê 300 g", available: true },
  { value: "Kraft 240 g", available: true },
  { value: "Perolado 250 g", available: false },
];
const COLORS = [
  { value: "Branco", color: "var(--color-paper)" },
  { value: "Preto", color: "var(--color-ink-soft)" },
  { value: "Coral", color: "var(--color-coral)" },
  { value: "Azul", color: "var(--color-blue)" },
  { value: "Amarelo", color: "var(--color-sun)" },
];

/** Radiogroup em chip e swatch, com opção sem preço de tabela esmaecida. */
export function OptionGroupDemo() {
  const [size, setSize] = useState(SIZES[0]);
  const [paper, setPaper] = useState(PAPERS[0].value);
  const [color, setColor] = useState(COLORS[2].value);
  return (
    <div className="grid gap-6">
      <div>
        <p className="mb-2.5 text-[15px] font-bold">Tamanho</p>
        <OptionGroup label="Tamanho" value={size} onChange={setSize} options={SIZES.map((value) => ({ value }))} />
      </div>
      <div>
        <p className="mb-2.5 text-[15px] font-bold">
          Papel <span className="text-caption font-normal text-muted">· “Perolado” sem preço na combinação</span>
        </p>
        <OptionGroup label="Papel" value={paper} onChange={setPaper} options={PAPERS} />
      </div>
      <div>
        <p className="mb-2.5 text-[15px] font-bold">
          Cor da peça <span className="text-caption font-normal text-muted">· {color}</span>
        </p>
        <OptionGroup label="Cor da peça" variant="swatch" value={color} onChange={setColor} options={COLORS} />
      </div>
      <p className="text-caption text-muted">Tab entra no grupo; as setas, Home e End trocam a opção, como um radio nativo.</p>
    </div>
  );
}

/** Campo com contador (maxLength) e validação que mostra o erro com role="alert". */
export function TextFieldDemo() {
  const [name, setName] = useState("Padrão Color");
  const [email, setEmail] = useState("contato@");
  const emailError = email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "Confira o e-mail: falta o domínio (ex.: nome@empresa.com.br)." : null;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <TextField label="Texto da arte" value={name} onChange={setName} maxLength={24} hint="Aparece no mockup 3D em tempo real." />
      <TextField label="E-mail" type="email" value={email} onChange={setEmail} error={emailError} autoComplete="off" />
    </div>
  );
}

/** Pílula alternável clara e escura. */
export function SegmentedControlDemo() {
  const [tab, setTab] = useState<"3d" | "fotos">("3d");
  const [period, setPeriod] = useState<"dia" | "semana" | "mes">("semana");
  return (
    <div className="grid gap-4">
      <SegmentedControl
        label="Visualização"
        value={tab}
        onChange={setTab}
        options={[
          {
            value: "3d",
            label: (
              <>
                <IconCube className="size-4" /> 3D
              </>
            ),
          },
          { value: "fotos", label: "Fotos" },
        ]}
      />
      <div className="rounded-card bg-ink p-4">
        <SegmentedControl
          label="Período"
          tone="dark"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "dia", label: "Dia" },
            { value: "semana", label: "Semana" },
            { value: "mes", label: "Mês" },
          ]}
        />
      </div>
    </div>
  );
}

/** Stepper de quantidade nos dois tamanhos, com o total recalculado. */
export function QtyStepperDemo() {
  const [qty, setQty] = useState(2);
  const [small, setSmall] = useState(1);
  return (
    <div className="flex flex-wrap items-end gap-6">
      <div>
        <p className="mb-2 text-caption text-muted">md · página de produto</p>
        <QtyStepper value={qty} onChange={setQty} label="Quantidade de pedidos" />
      </div>
      <div>
        <p className="mb-2 text-caption text-muted">sm · carrinho (máx. 9)</p>
        <QtyStepper value={small} onChange={setSmall} size="sm" max={9} label="Quantidade no carrinho" />
      </div>
      <Price size="total" value={qty * 89.9} pix={false} className="ml-auto" />
    </div>
  );
}

const FAQ = [
  { q: "Qual o prazo de produção?", a: "Conta a partir da aprovação da arte, em dias úteis. O prazo aparece na página de cada produto." },
  { q: "Posso enviar a arte em PDF ou CorelDRAW?", a: "Sim. Envie o arquivo no último passo: ele vai para a produção como você mandou." },
  { q: "O mockup 3D é fiel?", a: "É uma simulação com a sua arte em proporção real. A cor impressa segue o arquivo enviado." },
];

/** Acordeão com seta (filtros) e com + / − (FAQ). */
export function AccordionDemo() {
  const [open, setOpen] = useState<number | null>(0);
  const [filter, setFilter] = useState(true);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-card bg-cloud p-2">
        {FAQ.map((item, i) => (
          <AccordionItem
            key={item.q}
            title={item.q}
            icon="plus"
            open={open === i}
            onToggle={() => setOpen(open === i ? null : i)}
            buttonClassName="min-h-14 px-4 py-3 text-[17px] font-bold"
            className="border-b border-line-strong/60 last:border-0"
          >
            <p className="px-4 pb-4 text-muted">{item.a}</p>
          </AccordionItem>
        ))}
      </div>
      <div className="self-start rounded-card border border-line p-2">
        <AccordionItem title="Categoria" open={filter} onToggle={() => setFilter((v) => !v)} buttonClassName="min-h-12 px-3 font-bold">
          <ul className="grid gap-1 px-3 pb-3 text-sm">
            {["Cartões", "Adesivos", "Canecas", "Camisetas"].map((c) => (
              <li key={c} className="flex items-center gap-2">
                <span aria-hidden className="grid size-4 place-items-center rounded bg-ink text-white">
                  <IconCheck className="size-3" strokeWidth={3} />
                </span>
                {c}
              </li>
            ))}
          </ul>
        </AccordionItem>
        <p className="px-3 pb-2 text-caption text-muted">Fechado, o painel fica inert: sai do Tab e dos leitores de tela.</p>
      </div>
    </div>
  );
}

/** Modal centralizado com foco preso, Esc e clique no overlay para fechar. */
export function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="preview" size="sm" icon={<IconCube className="size-4" />} onClick={() => setOpen(true)}>
        Abrir diálogo
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Pré-visualização do pedido" className="max-w-lg p-7 md:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Pré-visualização</p>
        <h3 className="mt-2 text-title font-bold">Cartão de visita 9 × 5 cm</h3>
        <p className="mt-3 text-muted">
          O foco entra no painel, Tab circula só aqui dentro, Esc fecha e o foco volta para o botão que abriu. A rolagem da página fica travada.
        </p>
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-card bg-mist p-4 text-sm">
          <dt className="text-muted">Papel</dt>
          <dd className="font-semibold">Couchê 300 g</dd>
          <dt className="text-muted">Acabamento</dt>
          <dd className="font-semibold">Laminação fosca</dd>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="buy" onClick={() => setOpen(false)}>
            Adicionar ao carrinho
          </Button>
          <Button variant="outline" size="sm" className="self-center" onClick={() => setOpen(false)}>
            Continuar editando
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/** Gaveta lateral clara (carrinho) e escura (menu), sempre montada e inert quando fechada. */
export function DrawerDemo() {
  const [open, setOpen] = useState<"cart" | "menu" | null>(null);
  const close = () => setOpen(null);
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button variant="dark" size="sm" icon={<IconBag className="size-4" />} onClick={() => setOpen("cart")}>
          Gaveta clara, à direita
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpen("menu")}>
          Gaveta escura, à esquerda
        </Button>
      </div>
      <Drawer open={open === "cart"} onClose={close} label="Carrinho de exemplo">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <p className="text-lg font-bold">Seu carrinho</p>
          <IconButton label="Fechar carrinho" variant="ghost" onClick={close}>
            <IconClose className="size-5" />
          </IconButton>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {["Cartão de visita", "Caneca de porcelana"].map((item, i) => (
            <div key={item} className="flex items-center gap-4 rounded-card bg-page-cart p-3">
              <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-thumb bg-white text-coral-700 shadow-card">
                {i === 0 ? <IconUpload className="size-6" /> : <IconCube className="size-6" />}
              </span>
              <div className="flex-1">
                <p className="font-semibold">{item}</p>
                <Price value={i === 0 ? 89.9 : 39.5} className="mt-1" />
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-6">
          <Button variant="buy" size="lg" block onClick={close}>
            Finalizar pedido
          </Button>
        </div>
      </Drawer>
      <Drawer open={open === "menu"} onClose={close} label="Menu de exemplo" side="left" tone="dark" width="w-[380px]">
        <div className="flex items-center justify-between px-6 py-4">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">Menu</p>
          <IconButton label="Fechar menu" variant="ghost" className="hover:bg-white/10!" onClick={close}>
            <IconClose className="size-5" />
          </IconButton>
        </div>
        <ul className="grid gap-1 px-3">
          {["Impressos", "Adesivos e rótulos", "Comunicação visual", "Vestuário", "Brindes"].map((item) => (
            <li key={item}>
              <a href="#componentes" onClick={close} className="flex min-h-12 items-center rounded-control px-3 text-lg font-bold hover:bg-white/10">
                {item}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-auto px-6 pb-6 text-caption text-white/70">tone=&quot;dark&quot; aplica on-dark: o anel de foco fica branco.</p>
      </Drawer>
    </>
  );
}
