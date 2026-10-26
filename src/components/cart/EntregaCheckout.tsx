"use client";

import type { ReactNode } from "react";
import { UfSelect } from "@/components/account/FormBits";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import { formatCep } from "@/lib/api/validation";
import type { RotaDoCliente } from "@/lib/cliente";
import { LOJAS_RETIRADA, MODO_ENTREGA, type ModoEntrega } from "@/lib/entrega";
import { formatBRL } from "@/lib/format";
import type { OpcaoEntrega } from "@/lib/frete-pedido";
import type { DeliveryAddress, OrderDelivery } from "@/lib/orders";

/*
 * Passo "Entrega" do checkout, como no site antigo da Padrão (entrega.ts): à esquerda Delivery Padrão, retirada numa das
 * lojas e frete por transportadora; à direita o que vale para a escolhida (a rota e o endereço do cadastro, "Selecione uma
 * loja" com as 7 lojas em duas colunas, ou o endereço e as formas de entrega cotadas).
 */

export type EscolhaEntrega = {
  /** null = ainda não escolheu (vale o padrão: a rota, quando o cadastro tem). */
  modo: ModoEntrega | null;
  loja: number | null;
  /** Transportadora em outro endereço (senão, o do cadastro). */
  outro: boolean;
  servico: number | null;
};

/** Cotação da transportadora para um CEP e um carrinho (`chave`). */
export type CotacaoTela = { chave: string } & ({ tipo: "opcoes"; opcoes: OpcaoEntrega[] } | { tipo: "combinar"; motivo: "desligado" | "sem-medida" } | { tipo: "erro"; erro: string });

export type ContaEntrega = { rota: RotaDoCliente; pagaNaRetirada: boolean; registered: DeliveryAddress | null };

export function Option({ checked, onSelect, name, title, disabled = false, children }: { checked: boolean; onSelect: () => void; name: string; title: ReactNode; disabled?: boolean; children?: ReactNode }) {
  return (
    <label className={cx("flex items-start gap-3 rounded-thumb border p-3.5 transition-colors", checked ? "border-ink bg-mist" : "border-line", disabled && "cursor-not-allowed opacity-60")}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} disabled={disabled} className="mt-1 size-4 shrink-0 accent-ink" />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{title}</span>
        {children && <span className="block text-caption text-muted">{children}</span>}
      </span>
    </label>
  );
}

export function addressText(address: DeliveryAddress): string {
  const street = `${address.logradouro}, ${address.numero}${address.complemento ? ` – ${address.complemento}` : ""}`;
  return [street, address.bairro, `${address.cidade}/${address.estado}`, address.cep ? `CEP ${formatCep(address.cep)}` : ""].filter(Boolean).join(" · ");
}

/** A entrega do pedido em uma linha (simulação do checkout). */
export function entregaTexto(entrega: OrderDelivery): string {
  const partes: string[] = [entrega.tipo];
  if (entrega.rota) partes.push(entrega.rota.nome);
  if (entrega.loja) partes.push(entrega.loja.nome);
  if (entrega.transportadora) partes.push(`${entrega.transportadora.nome} (${entrega.transportadora.prazo})`);
  if (entrega.endereco) partes.push(addressText(entrega.endereco));
  partes.push(entrega.frete ? `frete ${formatBRL(entrega.frete)}` : "sem frete no pedido");
  return partes.join(" · ");
}

/** Rádio simples da coluna da esquerda (como no site antigo), com uma linha de apoio. */
function Modo({ checked, onSelect, title, disabled = false, children }: { checked: boolean; onSelect: () => void; title: string; disabled?: boolean; children: ReactNode }) {
  return (
    <label className={cx("flex items-start gap-2.5 py-1", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <input type="radio" name="modo-entrega" checked={checked} onChange={onSelect} disabled={disabled} className="mt-1 size-4 shrink-0 accent-ink" />
      <span className="min-w-0">
        <span className={cx("block text-[15px]", checked ? "font-semibold" : "font-medium")}>{title}</span>
        <span className="block text-caption text-muted">{children}</span>
      </span>
    </label>
  );
}

function AddressBox({ address, title = "Endereço de entrega" }: { address: DeliveryAddress; title?: string }) {
  return (
    <div className="rounded-thumb bg-mist p-4 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-muted">{addressText(address)}</p>
    </div>
  );
}

type Props = {
  conta: ContaEntrega | null;
  modo: ModoEntrega;
  escolha: EscolhaEntrega;
  onEscolha: (update: Partial<EscolhaEntrega>) => void;
  address: DeliveryAddress;
  setAddress: (update: (a: DeliveryAddress) => DeliveryAddress) => void;
  onCep: (value: string) => void;
  cepStatus: string | null;
  /** Cotação do CEP de agora (null enquanto calcula ou sem CEP). */
  cotacao: CotacaoTela | null;
  cotando: boolean;
};

export function EntregaCheckout({ conta, modo, escolha, onEscolha, address, setAddress, onCep, cepStatus, cotacao, cotando }: Props) {
  const rota = conta?.rota.tipo === "rota" ? conta.rota : null;
  const registered = conta?.registered ?? null;
  const temRota = Boolean(rota && registered);
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
      <fieldset className="space-y-1">
        <legend className="sr-only">Como receber o pedido</legend>
        <Modo checked={modo === "rota"} onSelect={() => onEscolha({ modo: "rota" })} disabled={!temRota} title={MODO_ENTREGA.rota}>
          {temRota ? "No endereço do cadastro, pela rota" : conta ? "Seu endereço não tem rota de entrega" : "Carregando o cadastro…"}
        </Modo>
        <Modo checked={modo === "retirada"} onSelect={() => onEscolha({ modo: "retirada" })} title={MODO_ENTREGA.retirada}>
          Sem frete
        </Modo>
        <Modo checked={modo === "transportadora"} onSelect={() => onEscolha({ modo: "transportadora" })} title={MODO_ENTREGA.transportadora}>
          Correios e transportadoras
        </Modo>
      </fieldset>

      <div className="min-w-0">
        {modo === "rota" && rota && registered && (
          <div className="space-y-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              {rota.cor && <span aria-hidden className="size-3 shrink-0 rounded-full ring-1 ring-line-strong" style={{ backgroundColor: rota.cor }} />}
              <span>
                Entrega pela <strong>{rota.nome}</strong>.
              </span>
            </p>
            <AddressBox address={registered} />
            <p className="text-caption text-muted">
              {rota.taxa > 0
                ? rota.cobradaNoPedido
                  ? `Taxa da rota: ${formatBRL(rota.taxa)}, cobrada no pedido como frete.`
                  : `Pagamento na entrega liberado no seu cadastro: a taxa da rota (${formatBRL(rota.taxa)}) não entra no pedido.`
                : "Sem taxa de rota no seu cadastro."}{" "}
              Para receber em outro endereço, use o frete por transportadora.
            </p>
          </div>
        )}

        {modo === "retirada" && (
          <fieldset>
            <legend className="mb-2 text-[15px] font-semibold">Selecione uma loja</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {LOJAS_RETIRADA.map((loja) => (
                <Option key={loja.id} name="loja-retirada" checked={escolha.loja === loja.id} onSelect={() => onEscolha({ loja: loja.id })} title={loja.nome}>
                  {loja.rua}
                  <br />
                  {loja.cidade}
                  {loja.parceira && conta?.pagaNaRetirada ? (
                    <>
                      <br />
                      Ponto parceiro: sem pagamento na retirada.
                    </>
                  ) : null}
                </Option>
              ))}
            </div>
            <p className="mt-3 text-caption text-muted">A retirada não tem frete. Retire depois do aviso de que o pedido está pronto.</p>
          </fieldset>
        )}

        {modo === "transportadora" && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-caption font-semibold text-muted">Endereço de entrega</legend>
              {registered && (
                <Option name="destino" checked={!escolha.outro} onSelect={() => onEscolha({ outro: false, servico: null })} title="Endereço do cadastro">
                  {addressText(registered)}
                </Option>
              )}
              <Option name="destino" checked={escolha.outro || !registered} onSelect={() => onEscolha({ outro: true, servico: null })} title="Outro endereço" />
            </fieldset>
            {(escolha.outro || !registered) && (
              <div className="grid gap-4 rounded-thumb border border-line p-4 md:grid-cols-2">
                <TextField label="CEP" value={address.cep} onChange={onCep} hint={cepStatus ?? undefined} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" />
                <TextField label="Rua" value={address.logradouro} onChange={(value) => setAddress((a) => ({ ...a, logradouro: value }))} autoComplete="address-line1" />
                <TextField label="Número" value={address.numero} onChange={(value) => setAddress((a) => ({ ...a, numero: value }))} autoComplete="off" />
                <TextField label="Complemento (opcional)" value={address.complemento} onChange={(value) => setAddress((a) => ({ ...a, complemento: value }))} autoComplete="address-line2" />
                <TextField label="Bairro" value={address.bairro} onChange={(value) => setAddress((a) => ({ ...a, bairro: value }))} autoComplete="address-level3" />
                <TextField label="Cidade" value={address.cidade} onChange={(value) => setAddress((a) => ({ ...a, cidade: value }))} autoComplete="address-level2" />
                <UfSelect value={address.estado} onChange={(value) => setAddress((a) => ({ ...a, estado: value }))} />
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="mb-2 text-caption font-semibold text-muted">Forma de entrega</legend>
              {cotando ? (
                <p role="status" className="text-sm text-muted">
                  Calculando o frete…
                </p>
              ) : !cotacao ? (
                <p className="text-sm text-muted">Informe o CEP para ver as formas de entrega.</p>
              ) : cotacao.tipo === "erro" ? (
                <p role="alert" className="text-sm font-semibold text-coral-700">
                  {cotacao.erro}
                </p>
              ) : cotacao.tipo === "combinar" ? (
                <p className="text-sm text-muted">
                  {cotacao.motivo === "sem-medida" ? "Um dos itens não tem a medida de envio cadastrada: " : ""}o frete por transportadora deste pedido é combinado com o atendimento depois do pedido.
                </p>
              ) : cotacao.opcoes.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma transportadora atende este CEP. Escolha a retirada ou fale com o atendimento.</p>
              ) : (
                cotacao.opcoes.map((opcao) => (
                  <Option
                    key={opcao.id}
                    name="servico-frete"
                    checked={escolha.servico === opcao.id}
                    onSelect={() => onEscolha({ servico: opcao.id })}
                    title={
                      <>
                        {opcao.titulo} · <span className="tabular-nums">{formatBRL(opcao.preco)}</span>
                      </>
                    }
                  >
                    {opcao.prazoTexto} depois que o pedido fica pronto
                  </Option>
                ))
              )}
            </fieldset>
          </div>
        )}
      </div>
    </div>
  );
}
