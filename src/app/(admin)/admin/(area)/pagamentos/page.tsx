import type { Metadata } from "next";
import EfiTools from "@/components/admin/EfiTools";
import { CieloForm, EfiForm, GatewaySwitcher, MeiosForm, RevealSecret } from "@/components/admin/PaymentSettingsForms";
import { cieloMockActive, cieloNotificationUrls } from "@/lib/multiloja/gateways/cielo";
import { Panel } from "@/components/painel/fields";
import { cx } from "@/components/ui/cx";
import { CIELO_SETTINGS_KEY, EFI_SETTINGS_KEY, cieloConfig, efiConfig, paymentSettings, publicUrl, type CieloSaved, type EfiSaved } from "@/lib/multiloja/config";
import { efiMockActive, gatewaysOverview, pixWebhookUrl, type Check } from "@/lib/multiloja/payments";
import { getSetting } from "@/lib/multiloja/settings";

export const metadata: Metadata = { title: "Pagamentos" };

function Checks({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y divide-line">
      {checks.map((c) => (
        <li key={c.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-[14px]">
          <span aria-hidden className={cx("grid size-6 shrink-0 place-items-center rounded-full text-[13px] font-black", c.ok ? "bg-lime-50 text-ink" : "bg-coral-50 text-coral-700")}>
            {c.ok ? "✓" : "!"}
          </span>
          <span className="font-bold">{c.label}</span>
          <span className="sr-only">{c.ok ? "ok" : "com problema"}</span>
          <span className="text-muted">{c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminPagamentos() {
  const { ativo, gateways } = await gatewaysOverview();
  const settings = paymentSettings();
  const efiSaved = getSetting<EfiSaved>(EFI_SETTINGS_KEY);
  const cieloSaved = getSetting<CieloSaved>(CIELO_SETTINGS_KEY);
  const efi = efiConfig();
  const cielo = cieloConfig();
  const byName = Object.fromEntries(gateways.map((g) => [g.name, g]));
  const webhook = pixWebhookUrl();
  const cieloUrls = cieloNotificationUrls();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">Pagamentos</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Escolha o gateway que cobra os pedidos de todas as lojas. A troca vale na hora para as cobranças novas; pedidos antigos continuam sendo consultados e devolvidos no gateway em que foram pagos.
        </p>
        {cieloMockActive() && <p className="mt-2 rounded-control bg-sun-50 px-4 py-2 text-[14px] font-semibold">Cielo ligada ao simulador local (MULTILOJA_CIELO_MOCK_URL): nenhuma cobrança real.</p>}
        {efiMockActive() && <p className="mt-2 rounded-control bg-sun-50 px-4 py-2 text-[14px] font-semibold">Efí ligada ao simulador local (MULTILOJA_EFI_MOCK_URL): nenhuma cobrança real.</p>}
      </div>

      <GatewaySwitcher
        desligado={ativo === "desligado"}
        gateways={gateways.map((g) => ({ name: g.name, label: g.label, methods: g.methods, configured: g.configured, active: g.active, problems: g.checks.filter((c) => !c.ok).length }))}
      />

      <Panel title="Formas de pagamento e taxas" description="O checkout oferece só as formas ligadas aqui que o gateway ativo sabe cobrar." id="meios">
        <MeiosForm metodos={settings.metodos} taxas={settings.taxas} boletoDias={settings.boletoDias} />
      </Panel>

      <Panel title="Efí" description="Pix (API Pix com certificado), boleto e cartão (API de Cobranças; o cartão abre a página segura da Efí)." id="efi">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <EfiForm
            data={{
              sandbox: efi?.sandbox ?? efiSaved?.sandbox !== false,
              clientId: efiSaved?.clientId ?? efi?.clientId ?? "",
              pixKey: efiSaved?.pixKey ?? efi?.pixKey ?? "",
              hasSecret: Boolean(efiSaved?.clientSecret || efi?.clientSecret),
              hasCert: Boolean(efiSaved?.certBase64 || efi?.certBase64 || efi?.certPath),
            }}
          />
          <div className="space-y-4">
            <p className="text-[14px] font-bold">Diagnóstico</p>
            <Checks checks={byName.efi?.checks ?? []} />
            <p className="break-all text-caption text-muted">Webhook do Pix: {webhook ? webhook.replace(/hmac=[^&]+/, "hmac=•••") : publicUrl() ? "salve a Efí para gerar o segredo" : "configure MULTILOJA_URL_PUBLICA (https)"}</p>
            <EfiTools sandbox={efi?.sandbox === true} canRegister={Boolean(efi && webhook)} />
          </div>
        </div>
      </Panel>

      <Panel title="Cielo" description="Pix e boleto pela API E-commerce; cartão pelo Link de Pagamento (página segura da Cielo, até 6x)." id="cielo">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <CieloForm
            data={{
              sandbox: cielo?.sandbox ?? cieloSaved?.sandbox !== false,
              merchantId: cieloSaved?.merchantId ?? cielo?.merchantId ?? "",
              boletoProvider: cieloSaved?.boletoProvider ?? cielo?.boletoProvider ?? "",
              clientId: cieloSaved?.clientId ?? cielo?.clientId ?? "",
              hasKey: Boolean(cieloSaved?.merchantKey || cielo?.merchantKey),
              hasClientSecret: Boolean(cieloSaved?.clientSecret || cielo?.clientSecret),
            }}
          />
          <div className="space-y-3">
            <p className="text-[14px] font-bold">Diagnóstico</p>
            <Checks checks={byName.cielo?.checks ?? []} />
            {cielo && cieloUrls.api && (
              <div className="space-y-2 rounded-control bg-mist p-4 text-[14px]">
                <p className="font-bold">Cadastre no portal da Cielo</p>
                <p>
                  <strong>API E-commerce</strong> (Gestão API E-commerce → Configurações → URL de notificações): <span className="break-all">{cieloUrls.api}</span>, com o cabeçalho{" "}
                  <code>{cieloUrls.header}</code> = <RevealSecret value={cielo.webhookSecret} />
                </p>
                {cieloUrls.link && (
                  <p>
                    <strong>Link de Pagamento</strong> (Configurações → URL de mudança de status): <span className="break-all">{cieloUrls.link.replace(/hmac=[^&]+/, "hmac=•••")}</span> (o segredo vai no fim; use o mesmo valor acima)
                  </p>
                )}
                <p className="text-caption text-muted">Pix e boleto exigem habilitação no portal (Pix Cielo; contrato de boleto com o banco). O Link de Pagamento não tem sandbox: teste com o Modo Teste da loja.</p>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
