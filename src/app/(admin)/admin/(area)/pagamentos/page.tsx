import type { Metadata } from "next";
import EfiTools from "@/components/admin/EfiTools";
import { CieloForm, EfiForm, GatewaySwitcher, MeiosForm, PagarmeForm, RevealSecret, type RotaOpcao } from "@/components/admin/PaymentSettingsForms";
import { cieloMockActive, cieloNotificationUrls } from "@/lib/multiloja/gateways/cielo";
import { pagarmeMockActive, pagarmeWebhookUrl } from "@/lib/multiloja/gateways/pagarme";
import { PageHeader, Sheet } from "@/components/admin/ui";
import { cx } from "@/components/ui/cx";
import { CIELO_SETTINGS_KEY, EFI_SETTINGS_KEY, PAGARME_SETTINGS_KEY, cieloConfig, efiConfig, pagarmeConfig, paymentSettings, publicUrl, type CieloSaved, type EfiSaved, type PagarmeSaved } from "@/lib/multiloja/config";
import { PAYMENT_KINDS, type PaymentKind } from "@/lib/multiloja/core";
import { FORMAS_DO_GATEWAY, GATEWAY_LABEL, GATEWAY_NAMES } from "@/lib/multiloja/pagamento-rotas";
import { efiMockActive, gatewaysOverview, pixWebhookUrl, type Check } from "@/lib/multiloja/payments";
import { getSetting } from "@/lib/multiloja/settings";

export const metadata: Metadata = { title: "Pagamentos" };

const FORMA_ARTIGO: Record<PaymentKind, string> = { pix: "o Pix", boleto: "o boleto", cartao: "o cartão" };

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
  const { rotas, disponiveis, gateways } = await gatewaysOverview();
  const settings = await paymentSettings();
  const efiSaved = (await getSetting<EfiSaved>(EFI_SETTINGS_KEY));
  const cieloSaved = (await getSetting<CieloSaved>(CIELO_SETTINGS_KEY));
  const pagarmeSaved = await getSetting<PagarmeSaved>(PAGARME_SETTINGS_KEY);
  const efi = await efiConfig();
  const cielo = await cieloConfig();
  const pagarme = await pagarmeConfig();
  const byName = Object.fromEntries(gateways.map((g) => [g.name, g]));
  const webhook = await pixWebhookUrl();
  const cieloUrls = await cieloNotificationUrls();
  const pagarmeUrl = await pagarmeWebhookUrl();
  const dev = process.env.NODE_ENV !== "production";
  const mocks = [efiMockActive() && "Efí", cieloMockActive() && "Cielo", pagarmeMockActive() && "Pagar.me"].filter(Boolean) as string[];

  // Seletor "Quem cobra" de cada forma: os gateways que cobram a forma nesta integração (a simulação só fora de
  // produção), com o motivo quando ainda não dá para usar, e Desligado.
  const opcoes = Object.fromEntries(
    PAYMENT_KINDS.map((k) => [
      k,
      [
        ...GATEWAY_NAMES.filter((g) => FORMAS_DO_GATEWAY[g].includes(k) && (g !== "simulado" || dev || rotas[k] === g)).map((g): RotaOpcao => {
          const status = byName[g];
          const nota = !status?.configured ? "sem credenciais" : !status.methods.includes(k) ? (g === "cielo" ? "falta o Link de Pagamento" : "não cobra esta forma") : undefined;
          return { value: g, label: g === "simulado" ? "Simulação (teste)" : GATEWAY_LABEL[g], nota };
        }),
        { value: "desligado", label: "Desligado" },
      ],
    ]),
  ) as Record<PaymentKind, RotaOpcao[]>;
  const avisos = Object.fromEntries(
    PAYMENT_KINDS.flatMap((k) => {
      const rota = rotas[k];
      return rota !== "desligado" && !disponiveis.includes(k) ? [[k, `A ${GATEWAY_LABEL[rota]} ainda não pode cobrar ${FORMA_ARTIGO[k]}: a forma não aparece no checkout.`]] : [];
    }),
  ) as Partial<Record<PaymentKind, string>>;

  return (
    <div className="space-y-6">
      <PageHeader
        group="Configuração"
        title="Pagamentos"
        description="Escolha quem cobra cada forma de pagamento em todas as lojas (por exemplo, Pix pela Pagar.me e cartão pela Cielo). A troca vale na hora para as cobranças novas; pedidos antigos continuam no gateway em que foram pagos."
      />
      {mocks.length > 0 && (
        <p className="rounded-card bg-sun-50 px-4 py-3 text-[13px] font-semibold">
          Simulador local ligado ({mocks.join(", ").replace(/, ([^,]*)$/, " e $1")}): nenhuma cobrança é real.
        </p>
      )}

      <GatewaySwitcher
        desligado={disponiveis.length === 0}
        gateways={gateways
          .filter((g) => g.name !== "simulado" || dev || g.cobrando.length > 0)
          .map((g) => ({ name: g.name, label: g.label, methods: g.methods, configured: g.configured, cobrando: g.cobrando, problems: g.checks.filter((c) => !c.ok).length }))}
      />

      <Sheet title="Quem cobra cada forma e taxas" description="Cada forma de pagamento tem o seu gateway. O checkout oferece só as formas com um gateway pronto para cobrar." id="meios">
        <MeiosForm rotas={settings.rotas} opcoes={opcoes} avisos={avisos} taxas={settings.taxas} boletoDias={settings.boletoDias} />
      </Sheet>

      <Sheet title="Pagar.me" description="Pix pela API da Pagar.me (versão 5): QR Code e copia e cola na página do pedido; o aviso de pagamento confirma o pedido sozinho." id="pagarme">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <PagarmeForm data={{ hasKey: Boolean(pagarmeSaved?.secretKey || pagarme), teste: pagarme?.teste ?? null }} />
          <div className="space-y-3 lg:border-l lg:border-line lg:pl-8">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Diagnóstico</p>
            <Checks checks={byName.pagarme?.checks ?? []} />
            {pagarme &&
              (pagarmeUrl ? (
                <div className="space-y-2 rounded-control bg-page-checkout p-4 text-[13px]">
                  <p className="font-bold">Cadastre no painel da Pagar.me (Webhooks)</p>
                  <p>
                    URL: <RevealSecret value={pagarmeUrl} hidden={pagarmeUrl.replace(/hmac=[^&]+/, "hmac=•••")} />
                  </p>
                  <p>
                    Eventos: <code>charge.paid</code>, <code>charge.payment_failed</code>, <code>charge.refunded</code> e <code>order.canceled</code>.
                  </p>
                  <p className="text-caption text-muted">Se o painel pedir autenticação básica, use qualquer usuário e o segredo do fim da URL como senha. O site sempre confere a cobrança na Pagar.me antes de mudar o pedido.</p>
                </div>
              ) : (
                <p className="text-caption text-muted">Para receber os avisos de pagamento, configure MULTILOJA_URL_PUBLICA (https). Sem aviso, o pedido é confirmado quando o cliente abre a página do pedido.</p>
              ))}
          </div>
        </div>
      </Sheet>

      <Sheet title="Efí" description="Pix (API Pix com certificado), boleto e cartão (API de Cobranças; o cartão abre a página segura da Efí)." id="efi">
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
          <div className="space-y-4 lg:border-l lg:border-line lg:pl-8">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Diagnóstico</p>
            <Checks checks={byName.efi?.checks ?? []} />
            <p className="break-all text-caption text-muted">Webhook do Pix: {webhook ? webhook.replace(/hmac=[^&]+/, "hmac=•••") : publicUrl() ? "salve a Efí para gerar o segredo" : "configure MULTILOJA_URL_PUBLICA (https)"}</p>
            <EfiTools sandbox={efi?.sandbox === true} canRegister={Boolean(efi && webhook)} />
          </div>
        </div>
      </Sheet>

      <Sheet title="Cielo" description="Pix e boleto pela API E-commerce; cartão pelo Link de Pagamento (página segura da Cielo, até 6x)." id="cielo">
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
          <div className="space-y-3 lg:border-l lg:border-line lg:pl-8">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Diagnóstico</p>
            <Checks checks={byName.cielo?.checks ?? []} />
            {cielo && cieloUrls.api && (
              <div className="space-y-2 rounded-control bg-page-checkout p-4 text-[13px]">
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
      </Sheet>
    </div>
  );
}
