import type { ApiCliente, ApiEndereco } from "./api/types";

/*
 * Leitura do GET /cliente (puro, testado), no formato que a API devolve de verdade (exemplo de 26/10/2026):
 * - saldo da conta corrente em `conta_corrente.credito` (o `saldo` antigo ainda é aceito);
 * - e-mail: `email` pode vir vazio, com o endereço só em `email_cadastro`;
 * - nascimento em DD/MM/AAAA;
 * - rota de entrega: o nome da rota é a cor dela ("VERDE"), com `taxa_rota` no endereço de entrega.
 *
 * Rota: a Padrão tem uma lista de rotas, cada uma com cor e taxa; a do cliente vem do endereço de entrega e, sem ela, do
 * cadastro. Sem rota: "Transportadora", e a entrega por rota não fica disponível. Com rota, o cliente com pagamento na
 * retirada liberado não paga a taxa junto com o pedido; os outros pagam a taxa no pedido, como frete.
 * Premissa a confirmar com a Padrão: pagamento na retirada liberado = `pagamento_antecipado` "N".
 */

const texto = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Número da API (17.00, "12,50"); null quando não veio. */
function valor(value: unknown): number | null {
  const n = typeof value === "number" ? value : texto(value) ? Number(texto(value).replace(",", ".")) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Saldo da conta corrente: `credito` (GET /cliente atual) ou `saldo` (formato antigo e GET /contacorrente). */
export function saldoDaConta(conta: { credito?: unknown; saldo?: unknown } | null | undefined): number | null {
  return valor(conta?.credito) ?? valor(conta?.saldo);
}

/** E-mail do cliente: o principal ou, vazio, o do cadastro. */
export function emailDoCliente(cliente: Pick<ApiCliente, "email" | "email_cadastro">): string {
  return texto(cliente.email) || texto(cliente.email_cadastro);
}

/** Nascimento "DD/MM/AAAA" → AAAA-MM-DD (campo date); "" quando não veio ou não é uma data. */
export function nascimentoDoCliente(cliente: Pick<ApiCliente, "nascimento">): string {
  const br = /^\s*(\d{2})\/(\d{2})\/(\d{4})\s*$/.exec(texto(cliente.nascimento));
  if (!br) return "";
  const iso = `${br[3]}-${br[2]}-${br[1]}`;
  return new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso ? iso : "";
}

export type RotaDoCliente =
  | {
      tipo: "rota";
      /** Nome para mostrar ("Rota Verde"). */
      nome: string;
      /** Cor da rota para a bolinha (pelo nome); null quando o nome não é uma cor conhecida. */
      cor: string | null;
      taxa: number;
      /** A taxa entra no pedido como frete (sem pagamento na retirada liberado). */
      cobradaNoPedido: boolean;
    }
  | { tipo: "transportadora" };

/** Cores das rotas pelo nome (sem acento, maiúsculas, masculino e feminino). */
const CORES: Record<string, string> = {
  VERDE: "#2e9e44",
  AZUL: "#1e66f5",
  VERMELHA: "#d62828",
  VERMELHO: "#d62828",
  AMARELA: "#f2c400",
  AMARELO: "#f2c400",
  LARANJA: "#f07c00",
  ROXA: "#7b3fb5",
  ROXO: "#7b3fb5",
  LILAS: "#b48ad8",
  ROSA: "#e64a9a",
  PRETA: "#1a1a1a",
  PRETO: "#1a1a1a",
  BRANCA: "#ffffff",
  BRANCO: "#ffffff",
  CINZA: "#8a8a8a",
  MARROM: "#7a4a24",
  BEGE: "#d8c3a0",
  DOURADA: "#c8a03c",
  DOURADO: "#c8a03c",
  PRATA: "#b8bec4",
};

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp: string, l: string) => sp + l.toUpperCase());

/** Pagamento na retirada liberado para o cliente. */
export const pagaNaRetirada = (cliente: Pick<ApiCliente, "pagamento_antecipado">) => texto(cliente.pagamento_antecipado).toUpperCase() === "N";

export function rotaDoCliente(cliente: Pick<ApiCliente, "endereco_entrega" | "endereco_cadastro" | "pagamento_antecipado">): RotaDoCliente {
  const endereco: Partial<ApiEndereco> | undefined = texto(cliente.endereco_entrega?.rota) ? cliente.endereco_entrega : cliente.endereco_cadastro;
  const rota = texto(endereco?.rota);
  if (!rota || /transportadora/i.test(rota)) return { tipo: "transportadora" };
  const palavras = semAcento(rota).split(/[^A-Z]+/).filter(Boolean);
  const cor = palavras.map((p) => CORES[p]).find(Boolean) ?? null;
  const nome = /^rota\b/i.test(rota) ? titulo(rota) : `Rota ${titulo(rota)}`;
  // A taxa vem no endereço de entrega; a rota do cadastro sozinha não traz taxa.
  const taxa = valor(endereco?.taxa_rota) ?? valor(cliente.endereco_entrega?.taxa_rota) ?? 0;
  return { tipo: "rota", nome, cor, taxa: Math.max(0, taxa), cobradaNoPedido: !pagaNaRetirada(cliente) };
}
