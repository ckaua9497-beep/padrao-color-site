import type { Metadata } from "next";
import EfiTools from "@/components/admin/EfiTools";
import { cx } from "@/components/ui/cx";
import { paymentRates } from "@/lib/multiloja/config";
import { activeProvider, efiDiagnostics, efiMockActive } from "@/lib/multiloja/payments";

export const metadata: Metadata = { title: "Pagamentos (Efí)" };

export default async function AdminPagamentos() {
  const { sandbox, checks, webhookUrl, registeredWebhook } = await efiDiagnostics();
  const provider = activeProvider();
  const rates = paymentRates();
  const failing = checks.filter((c) => !c.ok);
  const mock = efiMockActive();
  const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">Pagamentos (Efí)</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Pix e cartão das lojas caem na conta Efí da Padrão Color. Aqui você confere a configuração, testa a conexão e cadastra o webhook que confirma os Pix sozinho.
        </p>
      </div>

      <section className="rounded-panel bg-white p-5 shadow-card" aria-labelledby="situacao">
        <h2 id="situacao" className="text-lg font-bold">
          Situação
        </h2>
        <p className="mt-2 text-[15px]">
          Lojas cobrando com:{" "}
          <strong>{provider === "efi" && mock ? "simulador local da Efí (scripts/efi-mock.mjs), sem a Efí de verdade" : provider === "efi" ? `Efí (${sandbox ? "homologação: dinheiro de teste" : "produção: dinheiro real"})` : provider === "simulado" ? "simulação (nada é cobrado)" : "pagamento desligado (pedidos pelo WhatsApp)"}</strong>
        </p>
        <p className="mt-1 text-[15px] text-muted">
          Taxas descontadas da comissão: Pix {pct(rates.pix)} · cartão {pct(rates.cartao)} (MULTILOJA_TAXA_PIX / MULTILOJA_TAXA_CARTAO).
        </p>
        <ul className="mt-4 divide-y divide-line">
          {checks.map((c) => (
            <li key={c.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-[15px]">
              <span aria-hidden className={cx("grid size-6 shrink-0 place-items-center rounded-full text-[13px] font-black", c.ok ? "bg-lime-50 text-ink" : "bg-coral-50 text-coral-700")}>
                {c.ok ? "✓" : "!"}
              </span>
              <span className="font-bold">{c.label}</span>
              <span className="sr-only">{c.ok ? "ok" : "com problema"}</span>
              <span className="text-muted">{c.detail}</span>
            </li>
          ))}
        </ul>
        {failing.length > 0 && <p className="mt-3 text-[14px] text-muted">Corrija no arquivo de ambiente do servidor (.env.local) e reinicie o site.</p>}
      </section>

      <section className="rounded-panel bg-white p-5 shadow-card" aria-labelledby="webhook">
        <h2 id="webhook" className="text-lg font-bold">
          Webhook e testes
        </h2>
        <dl className="mt-3 space-y-1 text-[14px]">
          <div>
            <dt className="inline font-semibold">URL que será cadastrada: </dt>
            <dd className="inline break-all text-muted">{webhookUrl ?? "configure MULTILOJA_URL_PUBLICA (https) e MULTILOJA_EFI_WEBHOOK_SEGREDO"}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Cadastrada na Efí: </dt>
            <dd className="inline break-all text-muted">{registeredWebhook ?? "nenhuma"}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <EfiTools sandbox={sandbox === true} canRegister={Boolean(webhookUrl && sandbox !== null)} />
        </div>
      </section>

      <section className="rounded-panel bg-white p-5 shadow-card" aria-labelledby="passos">
        <h2 id="passos" className="text-lg font-bold">
          Como ligar
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px]">
          <li>
            No painel da Efí (app.sejaefi.com.br → API → Aplicações), crie uma aplicação com as APIs <strong>Pix</strong> e <strong>Emissão de Cobranças</strong> ligadas e os escopos de cobrança, webhook e devolução.
          </li>
          <li>Gere o certificado do mesmo ambiente (homologação ou produção) e salve o arquivo .p12 no servidor (ou o conteúdo em base64).</li>
          <li>Preencha no .env.local: MULTILOJA_PAGAMENTO=efi, as credenciais, o certificado, a chave Pix, MULTILOJA_URL_PUBLICA e MULTILOJA_EFI_WEBHOOK_SEGREDO. Reinicie o site.</li>
          <li>Volte aqui: todos os itens devem ficar verdes. Em homologação, crie o Pix de teste; depois cadastre o webhook.</li>
          <li>Para cartão, a conta Efí precisa do cadastro de cartão aprovado (formulário KYC da Efí, até 5 dias úteis).</li>
          <li>Para produção: troque as credenciais e o certificado pelos de produção, MULTILOJA_EFI_SANDBOX=false, e cadastre o webhook de novo.</li>
        </ol>
      </section>
    </div>
  );
}
