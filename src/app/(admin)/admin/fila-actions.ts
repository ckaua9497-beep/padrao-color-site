"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/multiloja/auth";
import { reenviar } from "@/lib/fila-pedidos/processar";
import { cancelar, marcarEnviado, obterEntrada, voltarParaFila } from "@/lib/fila-pedidos/repo";
import type { AdminResult } from "./actions";

/*
 * Ações da fila de pedidos do site (/admin/fila-pedidos). Toda ação começa por requireAdmin() e fica no histórico da
 * entrada com o e-mail de quem fez.
 */

export async function reenviarFila(protocolo: string): Promise<AdminResult> {
  await requireAdmin();
  const entrada = await obterEntrada(protocolo);
  if (!entrada) return { ok: false, message: "Protocolo não encontrado." };
  if (entrada.etapa !== "pendente" && entrada.etapa !== "conferir") return { ok: false, message: "Este pedido já saiu da fila." };
  const resultado = await reenviar(entrada.id);
  refresh();
  if (!resultado) return { ok: false, message: "A API da Padrão está fora do ar agora (ou o pedido está sendo enviado). Tente de novo em instantes." };
  return { ok: resultado.resultado === "enviado" || resultado.resultado === "simulado", message: resultado.mensagem };
}

export async function marcarFilaEnviado(protocolo: string, numero: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const limpo = numero.trim();
  if (!/^\d{1,12}$/.test(limpo)) return { ok: false, message: "Informe o número do pedido na Padrão (só números)." };
  const entrada = await obterEntrada(protocolo);
  if (!entrada) return { ok: false, message: "Protocolo não encontrado." };
  const ok = await marcarEnviado(entrada.id, limpo, admin.email);
  refresh();
  return ok ? { ok: true, message: `Marcado como enviado (pedido ${limpo}).` } : { ok: false, message: "Este pedido já saiu da fila." };
}

export async function devolverFila(protocolo: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const entrada = await obterEntrada(protocolo);
  if (!entrada) return { ok: false, message: "Protocolo não encontrado." };
  const ok = await voltarParaFila(entrada.id, admin.email);
  refresh();
  return ok ? { ok: true, message: "Devolvido ao reenvio automático." } : { ok: false, message: "Só pedidos em conferência voltam para a fila." };
}

export async function cancelarFila(protocolo: string, nota: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const entrada = await obterEntrada(protocolo);
  if (!entrada) return { ok: false, message: "Protocolo não encontrado." };
  const ok = await cancelar(entrada.id, admin.email, nota.trim().slice(0, 300));
  refresh();
  return ok ? { ok: true, message: "Cancelado: não vai para a produção." } : { ok: false, message: "Este pedido já saiu da fila." };
}
