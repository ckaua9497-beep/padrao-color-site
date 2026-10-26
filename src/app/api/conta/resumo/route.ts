import { apiFailure, json, sessionOr401 } from "@/lib/api/guard";
import { getCliente, getContaCorrente } from "@/lib/api/padrao";
import { maskDocument } from "@/lib/api/validation";
import { pagaNaRetirada, rotaDoCliente, saldoDaConta } from "@/lib/cliente";
import { addressFromApi } from "@/lib/orders";

/**
 * GET /api/conta/resumo: o que o checkout precisa da conta logada — documento mascarado, endereço de
 * entrega do cadastro (GET /cliente), a rota dele e se o pagamento na retirada está liberado (cliente.ts), e
 * saldo/crédito (GET /contacorrente, só informativo).
 */
export async function GET() {
  const auth = await sessionOr401();
  if (!auth.ok) return auth.response;
  const [cliente, conta] = await Promise.allSettled([getCliente(auth.session.token), getContaCorrente(auth.session.token)]);
  if (cliente.status === "rejected") return apiFailure(cliente.reason, { session: true });
  const data = cliente.value;
  const account = conta.status === "fulfilled" ? conta.value : null;
  return json({
    document: maskDocument(data?.documento ?? ""),
    address: addressFromApi(data?.endereco_entrega) ?? addressFromApi(data?.endereco_cadastro),
    balance: saldoDaConta(account) ?? saldoDaConta(data?.conta_corrente),
    blocked: account?.bloqueado ?? data?.conta_corrente?.bloqueado ?? null,
    rota: data ? rotaDoCliente(data) : { tipo: "transportadora" },
    pagaNaRetirada: data ? pagaNaRetirada(data) : false,
  });
}
