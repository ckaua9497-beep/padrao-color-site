"use client";

import { useState, useTransition } from "react";
import { ativarGateway, salvarCielo, salvarEfi, salvarMeios, salvarPagarme, type AdminResult } from "@/app/(admin)/admin/actions";
import { Field, FormMessage } from "@/components/painel/fields";
import { useFormAction } from "@/components/painel/useFormAction";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { PAYMENT_KINDS, PAYMENT_LABEL, type PaymentKind, type PaymentRates } from "@/lib/multiloja/core";
import { listaFormas } from "@/lib/multiloja/pagamento-rotas";

/* Formulários do admin → Pagamentos: gateway de cada forma, taxas, credenciais da Efí, da Cielo e da Pagar.me. */

export type GatewayCard = { name: string; label: string; methods: readonly PaymentKind[]; configured: boolean; cobrando: readonly PaymentKind[]; problems: number };

/** Um clique: o gateway passa a cobrar todas as formas que sabe cobrar (a Pagar.me, só o Pix). */
export function GatewaySwitcher({ gateways, desligado }: { gateways: GatewayCard[]; desligado: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const choose = (name: string) => startTransition(async () => setResult(await ativarGateway(name)));
  const card = (active: boolean) => cx("relative flex flex-col rounded-card bg-white p-4 shadow-sheet transition-shadow", active && "ring-2 ring-ink");
  const pick = "h-9 rounded-full px-3.5 text-[13px] font-bold transition-colors disabled:opacity-50";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" role="list" aria-label="Gateways de pagamento">
        {gateways.map((g) => {
          const tone = g.configured ? (g.problems ? "bg-coral" : "bg-lime-700") : "bg-line-strong";
          const active = g.cobrando.length > 0;
          const everything = g.methods.every((m) => g.cobrando.includes(m));
          return (
            <div key={g.name} role="listitem" className={card(active)}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[16px] font-extrabold">{g.label}</p>
                {active && <span className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-bold text-white">Ativo</span>}
              </div>
              <p className="mt-0.5 text-[12px] text-muted">{g.methods.map((m) => PAYMENT_LABEL[m]).join(" · ")}</p>
              <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold">
                <span aria-hidden className={cx("size-2 rounded-full", tone)} />
                {g.configured ? (g.problems ? `${g.problems} ${g.problems === 1 ? "alerta" : "alertas"} no diagnóstico` : "Configurado e funcionando") : "Sem credenciais"}
              </p>
              <div className="mt-auto space-y-2 pt-4">
                {active && <p className="text-[12px] text-muted">Cobra agora: {listaFormas(g.cobrando)}.</p>}
                {!g.configured ? (
                  <a href={`#${g.name}`} className={cx(pick, "inline-flex items-center border border-line-strong text-muted hover:border-ink hover:text-ink")}>
                    Configure abaixo
                  </a>
                ) : (
                  !everything && (
                    <button type="button" disabled={pending} onClick={() => choose(g.name)} className={cx(pick, "bg-ink text-white hover:bg-coral-700")}>
                      {g.methods.length === PAYMENT_KINDS.length ? "Usar para tudo" : `Usar no ${listaFormas(g.methods)}`}
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
        <div role="listitem" className={card(desligado)}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[16px] font-extrabold">Desligado</p>
            {desligado && <span className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-bold text-white">Ativo</span>}
          </div>
          <p className="mt-0.5 text-[12px] text-muted">Sem pagamento online: o pedido vai pronto para o WhatsApp da loja.</p>
          {!desligado && <p className="mt-3 text-[12px] text-muted">Desliga todas as formas de uma vez.</p>}
          <div className="mt-auto pt-4">
            {!desligado && (
              <button type="button" disabled={pending} onClick={() => choose("desligado")} className={cx(pick, "border border-line-strong hover:border-ink")}>
                Desligar tudo
              </button>
            )}
          </div>
        </div>
      </div>
      {result && (
        <p role="status" className={result.ok ? "text-[14px] font-semibold" : "text-[14px] font-semibold text-coral-700"}>
          {result.message}
        </p>
      )}
    </div>
  );
}

const fmt = (n: number) => (n ? n.toFixed(2).replace(".", ",") : "0");

/** Opção do seletor "Quem cobra": `nota` explica por que ainda não dá para usar (sem credenciais, falta o Link…). */
export type RotaOpcao = { value: string; label: string; nota?: string };

/** Quem cobra cada forma (gateway ou Desligado), taxas e vencimento do boleto. */
export function MeiosForm({ rotas, opcoes, avisos, taxas, boletoDias }: { rotas: Record<PaymentKind, string>; opcoes: Record<PaymentKind, RotaOpcao[]>; avisos: Partial<Record<PaymentKind, string>>; taxas: PaymentRates; boletoDias: number }) {
  const { state, submit, pending } = useFormAction(salvarMeios);
  const errors = state?.errors ?? {};
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[15px]">
          <thead className="text-caption text-muted">
            <tr>
              <th className="py-2 pr-4 font-semibold">Forma</th>
              <th className="py-2 pr-4 font-semibold">Quem cobra</th>
              <th className="py-2 pr-4 font-semibold">Taxa (%)</th>
              <th className="py-2 font-semibold">Taxa fixa (R$)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {PAYMENT_KINDS.map((k) => (
              <tr key={k}>
                <td className="py-2 pr-4 align-top font-bold leading-10">{PAYMENT_LABEL[k]}</td>
                <td className="py-2 pr-4 align-top">
                  <select
                    key={rotas[k]}
                    name={`rota_${k}`}
                    aria-label={`Quem cobra o ${PAYMENT_LABEL[k]}`}
                    defaultValue={rotas[k]}
                    className={cx("h-10 w-full max-w-72 rounded-control border bg-white px-3 text-[15px]", errors[`rota_${k}`] ? "border-coral-700" : "border-line")}
                  >
                    {opcoes[k].map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.nota ? `${o.label} (${o.nota})` : o.label}
                      </option>
                    ))}
                  </select>
                  {(errors[`rota_${k}`] || avisos[k]) && <p className="mt-1 max-w-72 text-caption font-semibold text-coral-700">{errors[`rota_${k}`] ?? avisos[k]}</p>}
                </td>
                <td className="py-2 pr-4 align-top">
                  <input aria-label={`Taxa percentual do ${PAYMENT_LABEL[k]}`} name={`taxa_${k}_pct`} inputMode="decimal" defaultValue={fmt(taxas[k].pct)} className={cx("h-10 w-24 rounded-control border px-3", errors[`taxa_${k}_pct`] ? "border-coral-700" : "border-line")} />
                </td>
                <td className="py-2 align-top">
                  <input aria-label={`Taxa fixa do ${PAYMENT_LABEL[k]}`} name={`taxa_${k}_fixo`} inputMode="decimal" defaultValue={fmt(taxas[k].fixed)} className={cx("h-10 w-24 rounded-control border px-3", errors[`taxa_${k}_fixo`] ? "border-coral-700" : "border-line")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field className="max-w-48" label="Vencimento do boleto (dias)" name="boletoDias" inputMode="numeric" defaultValue={String(boletoDias)} error={errors.boletoDias} />
      <p className="text-caption text-muted">Forma desligada não aparece no checkout. As taxas são descontadas da comissão do lojista (o cliente não paga a mais). O Pix tem o desconto de 5% do site.</p>
      <Button type="submit" size="sm" loading={pending}>
        Salvar formas e taxas
      </Button>
    </form>
  );
}

export type EfiFormData = { sandbox: boolean; clientId: string; pixKey: string; hasSecret: boolean; hasCert: boolean };

export function EfiForm({ data }: { data: EfiFormData }) {
  const { state, submit, pending } = useFormAction(salvarEfi);
  const errors = state?.errors ?? {};
  return (
    <form key={state?.ok ? "salvo" : "form"} onSubmit={submit} className="space-y-4" encType="multipart/form-data" noValidate>
      <FormMessage state={state} />
      <label className="flex items-center gap-2 text-[15px] font-semibold">
        <input type="checkbox" name="sandbox" defaultChecked={data.sandbox} className="size-4 accent-ink" /> Homologação (dinheiro de teste)
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Client ID" name="clientId" defaultValue={data.clientId} autoComplete="off" spellCheck={false} error={errors.clientId} />
        <Field label="Client Secret" name="clientSecret" type="password" autoComplete="new-password" placeholder={data.hasSecret ? "•••••• salvo (em branco mantém)" : ""} error={errors.clientSecret} />
        <Field label="Chave Pix da conta" name="pixKey" defaultValue={data.pixKey} autoComplete="off" error={errors.pixKey} />
        <div>
          <label htmlFor="campo-certificado" className="mb-1.5 block text-[15px] font-bold">
            Certificado .p12 {data.hasCert && <span className="font-normal text-muted">(salvo; envie outro para trocar)</span>}
          </label>
          <input id="campo-certificado" name="certificado" type="file" accept=".p12,.pfx" className="block w-full text-[14px] file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-ink file:px-4 file:font-bold file:text-white" />
          {errors.certificado && <p className="mt-1.5 text-caption font-semibold text-coral-700">{errors.certificado}</p>}
        </div>
      </div>
      <p className="text-caption text-muted">Chaves e certificado ficam cifrados no banco e nunca voltam para a tela.</p>
      <Button type="submit" size="sm" loading={pending}>
        Salvar Efí
      </Button>
    </form>
  );
}

export type CieloFormData = { sandbox: boolean; merchantId: string; boletoProvider: string; clientId: string; hasKey: boolean; hasClientSecret: boolean };

export function CieloForm({ data }: { data: CieloFormData }) {
  const { state, submit, pending } = useFormAction(salvarCielo);
  const errors = state?.errors ?? {};
  return (
    <form key={state?.ok ? "salvo" : "form"} onSubmit={submit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <label className="flex items-center gap-2 text-[15px] font-semibold">
        <input type="checkbox" name="sandbox" defaultChecked={data.sandbox} className="size-4 accent-ink" /> Sandbox (ambiente de testes da Cielo)
      </label>
      <p className="text-[14px] font-bold">API E-commerce Cielo (Pix e boleto)</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="MerchantId" name="merchantId" defaultValue={data.merchantId} autoComplete="off" spellCheck={false} error={errors.merchantId} />
        <Field label="MerchantKey" name="merchantKey" type="password" autoComplete="new-password" placeholder={data.hasKey ? "•••••• salva (em branco mantém)" : ""} error={errors.merchantKey} />
        <Field label="Banco do boleto (Provider)" name="boletoProvider" defaultValue={data.boletoProvider} placeholder="Bradesco2, BancoDoBrasil3… (sandbox: Simulado)" hint="Como está habilitado na sua conta Cielo." />
      </div>
      <p className="text-[14px] font-bold">Checkout / Link de Pagamento Cielo (página segura do cartão)</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Client ID" name="clientId" defaultValue={data.clientId} autoComplete="off" spellCheck={false} hint="Sem ele, a Cielo cobra só Pix e boleto." />
        <Field label="Client Secret" name="clientSecret" type="password" autoComplete="new-password" placeholder={data.hasClientSecret ? "•••••• salvo (em branco mantém)" : ""} />
      </div>
      <p className="text-caption text-muted">Chaves ficam cifradas no banco e nunca voltam para a tela.</p>
      <Button type="submit" size="sm" loading={pending}>
        Salvar Cielo
      </Button>
    </form>
  );
}

export type PagarmeFormData = { hasKey: boolean; teste: boolean | null };

/** Chave secreta da API v5 da Pagar.me (só Pix nesta integração). */
export function PagarmeForm({ data }: { data: PagarmeFormData }) {
  const { state, submit, pending } = useFormAction(salvarPagarme);
  const errors = state?.errors ?? {};
  return (
    <form key={state?.ok ? "salvo" : "form"} onSubmit={submit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="Chave secreta (sk_…)"
        name="secretKey"
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        placeholder={data.hasKey ? `•••••• salva${data.teste ? " (de teste)" : ""}: em branco mantém` : "sk_test_… ou sk_…"}
        hint="A de teste (sk_test_) usa o simulador da Pagar.me; a de produção (sk_) cobra de verdade."
        error={errors.secretKey}
      />
      <p className="text-caption text-muted">A chave fica cifrada no banco e nunca volta para a tela. A conta precisa estar com o Pix habilitado na Pagar.me.</p>
      <Button type="submit" size="sm" loading={pending}>
        Salvar Pagar.me
      </Button>
    </form>
  );
}

/** Segredo dos avisos (para cadastrar no portal do gateway), escondido até clicar. `hidden`: o que aparece fechado. */
export function RevealSecret({ value, hidden = "••••••••••••" }: { value: string; hidden?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code className="break-all rounded bg-mist px-2 py-0.5 text-[13px]">{shown ? value : hidden}</code>
      <button type="button" onClick={() => setShown((v) => !v)} className="text-caption font-bold underline underline-offset-2">
        {shown ? "Esconder" : "Mostrar"}
      </button>
    </span>
  );
}
