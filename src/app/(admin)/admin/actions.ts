"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { emailError, isOrderStatus, isPlan, ORDER_NEXT } from "@/lib/multiloja/core";
import { endAdminSession, painelLimits, requestIp, requireAdmin, startAdminSession, timingDummy, verifyPassword } from "@/lib/multiloja/auth";
import { getLoja, setLojistaStatus, updateLoja } from "@/lib/multiloja/repo";
import { findAdminLogin, getPedidoByCodigo, resolveSaque, setPedidoStatus, touchAdminLogin } from "@/lib/multiloja/repo-vendas";
import { cancelOrder, sendToProduction } from "@/lib/multiloja/vendas";
import { chargeStatus, efiDiagnostics, registerPixWebhook, sandboxTestPix } from "@/lib/multiloja/payments";
import type { FormState } from "@/app/(painel)/painel/actions";

/*
 * Ações do admin da multiloja (equipe da Padrão Color). Toda ação começa por requireAdmin() e registra quem fez
 * no histórico do pedido.
 */

export async function entrarAdmin(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const senha = String(form.get("senha") ?? "");
  if (emailError(email) || !senha) return { message: "Informe e-mail e senha." };
  const ip = await requestIp();
  for (const [limiter, key] of [
    [painelLimits.loginIp, ip ? `admin:${ip}` : null],
    [painelLimits.loginEmail, `admin:${email}`],
  ] as const) {
    if (!key) continue;
    const hit = limiter.hit(key);
    if (!hit.ok) return { message: "Muitas tentativas. Tente de novo em alguns minutos." };
  }
  const admin = findAdminLogin(email);
  const valid = admin ? await verifyPassword(senha, admin.senhaHash) : (await verifyPassword(senha, await timingDummy()), false);
  if (!admin || !valid) return { message: "E-mail ou senha incorretos." };
  touchAdminLogin(admin.id);
  await startAdminSession(admin.id);
  redirect("/admin");
}

export async function sairAdmin() {
  await endAdminSession();
  redirect("/admin/entrar");
}

export type AdminResult = { ok: boolean; message: string; payload?: string };

export async function mudarStatus(codigo: string, status: string, nota: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const pedido = getPedidoByCodigo(codigo);
  if (!pedido) return { ok: false, message: "Pedido não encontrado." };
  if (!isOrderStatus(status) || !ORDER_NEXT[pedido.status].includes(status)) return { ok: false, message: "Mudança de status não permitida." };
  if (status === "cancelado") {
    // Pedido pago: devolve o Pix / estorna o cartão na Efí antes de cancelar.
    const result = await cancelOrder(pedido, `admin:${admin.email}`, nota.trim().slice(0, 300));
    refresh();
    return result;
  }
  setPedidoStatus(pedido.id, status, `admin:${admin.email}`, nota.trim().slice(0, 300));
  refresh();
  return { ok: true, message: "Status atualizado." };
}

export async function enviarProducao(codigo: string): Promise<AdminResult> {
  await requireAdmin();
  const pedido = getPedidoByCodigo(codigo);
  if (!pedido) return { ok: false, message: "Pedido não encontrado." };
  if (pedido.status !== "pago") return { ok: false, message: "Só pedidos pagos vão para a produção." };
  const result = await sendToProduction(pedido);
  refresh();
  if (!result.ok) return { ok: false, message: result.message };
  return {
    ok: true,
    message: result.simulated ? "Simulação: pedido marcado em produção, sem chamar a API (PADRAO_ORDERS_ENABLED desligado ou sem cliente da multiloja)." : `Enviado à Padrão${result.numero ? ` (pedido ${result.numero})` : ""}.`,
    payload: JSON.stringify(result.payload, null, 2),
  };
}

export async function definirPlano(lojaId: number, plano: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isPlan(plano) || !getLoja(lojaId)) return { ok: false, message: "Plano ou loja inválidos." };
  updateLoja(lojaId, { plano });
  refresh();
  return { ok: true, message: "Plano atualizado." };
}

export async function alternarLoja(lojaId: number, ativa: boolean): Promise<AdminResult> {
  await requireAdmin();
  if (!getLoja(lojaId)) return { ok: false, message: "Loja não encontrada." };
  updateLoja(lojaId, { ativa });
  refresh();
  return { ok: true, message: ativa ? "Loja reativada." : "Loja fora do ar." };
}

export async function marcarDominio(lojaId: number, verificado: boolean): Promise<AdminResult> {
  await requireAdmin();
  const loja = getLoja(lojaId);
  if (!loja?.dominio) return { ok: false, message: "A loja não tem domínio próprio cadastrado." };
  updateLoja(lojaId, { dominioVerificado: verificado });
  refresh();
  return { ok: true, message: verificado ? `Domínio ${loja.dominio} liberado.` : "Domínio desligado." };
}

export async function bloquearLojista(lojistaId: number, bloquear: boolean): Promise<AdminResult> {
  await requireAdmin();
  setLojistaStatus(lojistaId, bloquear ? "bloqueado" : "ativo");
  refresh();
  return { ok: true, message: bloquear ? "Acesso do lojista bloqueado." : "Acesso do lojista liberado." };
}

export async function resolverSaque(id: number, status: "pago" | "recusado", nota: string): Promise<AdminResult> {
  await requireAdmin();
  if (status !== "pago" && status !== "recusado") return { ok: false, message: "Situação inválida." };
  if (status === "recusado" && !nota.trim()) return { ok: false, message: "Diga o motivo da recusa (o lojista vê)." };
  const done = resolveSaque(id, status, nota.trim().slice(0, 200));
  refresh();
  return done ? { ok: true, message: status === "pago" ? "Saque marcado como pago." : "Saque recusado; o valor volta ao saldo do lojista." } : { ok: false, message: "Este saque já foi resolvido." };
}

// ---------------------------------------------------------------------------------- Efí

export type EfiDiagnostico = Awaited<ReturnType<typeof efiDiagnostics>>;

export async function efiDiagnostico(): Promise<EfiDiagnostico> {
  await requireAdmin();
  return efiDiagnostics();
}

export async function efiCadastrarWebhook(): Promise<AdminResult> {
  await requireAdmin();
  return registerPixWebhook();
}

export async function efiPixTeste(): Promise<Awaited<ReturnType<typeof sandboxTestPix>>> {
  await requireAdmin();
  return sandboxTestPix();
}

export async function efiConsultarTeste(txid: string): Promise<AdminResult> {
  await requireAdmin();
  if (!/^[a-zA-Z0-9]{26,35}$/.test(txid)) return { ok: false, message: "Identificador inválido." };
  try {
    const result = await chargeStatus("efi", txid);
    return { ok: true, message: result.status === "pago" ? `Pago (e2eId ${result.e2eId ?? "?"}).` : result.status === "expirado" ? "Cobrança removida." : "Ainda aguardando pagamento." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erro ao consultar a Efí." };
  }
}
