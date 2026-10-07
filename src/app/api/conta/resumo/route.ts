import { apiFailure, json, sessionOr401 } from "@/lib/api/guard";
import { getCliente, getContaCorrente } from "@/lib/api/padrao";
import { maskDocument } from "@/lib/api/validation";
import { addressFromApi } from "@/lib/orders";

/**
 * GET /api/conta/resumo: o que o checkout precisa da conta logada — documento mascarado, endereço de
 * entrega do cadastro (GET /cliente) e saldo/crédito (GET /contacorrente, só informativo).
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
    balance: account?.saldo ?? data?.conta_corrente?.saldo ?? null,
    blocked: account?.bloqueado ?? data?.conta_corrente?.bloqueado ?? null,
  });
}
