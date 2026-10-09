"use client";

import { useState, useTransition } from "react";
import { ativarGateway, salvarCielo, salvarEfi, salvarMeios, type AdminResult } from "@/app/(admin)/admin/actions";
import { Field, FormMessage } from "@/components/painel/fields";
import { useFormAction } from "@/components/painel/useFormAction";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { PAYMENT_KINDS, PAYMENT_LABEL, type PaymentKind, type PaymentRates } from "@/lib/multiloja/core";

/* Formulários do admin → Pagamentos: gateway ativo, meios e taxas, credenciais da Efí e da Cielo. */

export type GatewayCard = { name: string; label: string; methods: readonly PaymentKind[]; configured: boolean; active: boolean; problems: number };

/** Um clique: todas as cobranças novas passam pelo gateway escolhido. */
export function GatewaySwitcher({ gateways, desligado }: { gateways: GatewayCard[]; desligado: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const choose = (name: string) => startTransition(async () => setResult(await ativarGateway(name)));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {gateways.map((g) => (
          <div key={g.name} className={cx("flex flex-col rounded-panel border-2 bg-white p-4", g.active ? "border-ink" : "border-transparent shadow-card")}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-black">{g.label}</p>
              {g.active && <span className="rounded-full bg-ink px-3 py-1 text-[12px] font-bold text-white">Ativo</span>}
            </div>
            <p className="mt-1 text-caption text-muted">{g.methods.map((m) => PAYMENT_LABEL[m]).join(" · ")}</p>
            <p className={cx("mt-2 text-[14px] font-semibold", g.configured ? (g.problems ? "text-coral-700" : "text-ink") : "text-muted")}>
              {g.configured ? (g.problems ? `Configurado, ${g.problems} ${g.problems === 1 ? "alerta" : "alertas"} no diagnóstico` : "Configurado e funcionando") : "Sem credenciais"}
            </p>
            <div className="mt-auto pt-3">
              {g.active ? (
                <p className="text-caption text-muted">Todas as cobranças novas passam por aqui.</p>
              ) : (
                <Button type="button" size="sm" variant={g.configured ? "dark" : "outline"} disabled={pending || !g.configured} onClick={() => choose(g.name)}>
                  Usar este gateway
                </Button>
              )}
            </div>
          </div>
        ))}
        <div className={cx("flex flex-col rounded-panel border-2 bg-white p-4", desligado ? "border-ink" : "border-transparent shadow-card")}>
          <p className="text-lg font-black">Desligado</p>
          <p className="mt-1 text-caption text-muted">Sem pagamento online: o pedido vai pronto para o WhatsApp da loja.</p>
          <div className="mt-auto pt-3">
            {desligado ? (
              <span className="rounded-full bg-ink px-3 py-1 text-[12px] font-bold text-white">Ativo</span>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => choose("desligado")}>
                Desligar pagamento online
              </Button>
            )}
          </div>
        </div>
      </div>
      {result && (
        <p role="status" className={result.ok ? "text-[15px] font-semibold" : "text-[15px] font-semibold text-coral-700"}>
          {result.message}
        </p>
      )}
    </div>
  );
}

const fmt = (n: number) => (n ? n.toFixed(2).replace(".", ",") : "0");

export function MeiosForm({ metodos, taxas, boletoDias }: { metodos: Record<PaymentKind, boolean>; taxas: PaymentRates; boletoDias: number }) {
  const { state, submit, pending } = useFormAction(salvarMeios);
  const errors = state?.errors ?? {};
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[15px]">
          <thead className="text-caption text-muted">
            <tr>
              <th className="py-2 pr-4 font-semibold">Forma</th>
              <th className="py-2 pr-4 font-semibold">Oferecer no checkout</th>
              <th className="py-2 pr-4 font-semibold">Taxa (%)</th>
              <th className="py-2 font-semibold">Taxa fixa (R$)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {PAYMENT_KINDS.map((k) => (
              <tr key={k}>
                <td className="py-2 pr-4 font-bold">{PAYMENT_LABEL[k]}</td>
                <td className="py-2 pr-4">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" name={`metodo_${k}`} defaultChecked={metodos[k]} className="size-4 accent-ink" /> Ligado
                  </label>
                </td>
                <td className="py-2 pr-4">
                  <input aria-label={`Taxa percentual do ${PAYMENT_LABEL[k]}`} name={`taxa_${k}_pct`} inputMode="decimal" defaultValue={fmt(taxas[k].pct)} className={cx("h-10 w-24 rounded-control border px-3", errors[`taxa_${k}_pct`] ? "border-coral-700" : "border-line")} />
                </td>
                <td className="py-2">
                  <input aria-label={`Taxa fixa do ${PAYMENT_LABEL[k]}`} name={`taxa_${k}_fixo`} inputMode="decimal" defaultValue={fmt(taxas[k].fixed)} className={cx("h-10 w-24 rounded-control border px-3", errors[`taxa_${k}_fixo`] ? "border-coral-700" : "border-line")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field className="max-w-48" label="Vencimento do boleto (dias)" name="boletoDias" inputMode="numeric" defaultValue={String(boletoDias)} error={errors.boletoDias} />
      <p className="text-caption text-muted">As taxas são descontadas da comissão do lojista (o cliente não paga a mais). O Pix tem o desconto de 5% do site.</p>
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

/** Segredo dos avisos (para cadastrar no portal do gateway), escondido até clicar. */
export function RevealSecret({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code className="break-all rounded bg-mist px-2 py-0.5 text-[13px]">{shown ? value : "••••••••••••"}</code>
      <button type="button" onClick={() => setShown((v) => !v)} className="text-caption font-bold underline underline-offset-2">
        {shown ? "Esconder" : "Mostrar"}
      </button>
    </span>
  );
}
