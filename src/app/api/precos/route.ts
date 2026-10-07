import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/client";
import { fail, json } from "@/lib/api/guard";
import { catalogProduct, groupPrices } from "@/lib/api/prices";
import { clearSession, getSession } from "@/lib/session";

/**
 * GET /api/precos?grupo=<id>: variações do grupo no formato do catálogo (id, p, pe, q, d, de, v) com a
 * tabela do cliente logado. Revendedor = GET /produtos com o token dele; os demais = catálogo (balcão).
 * O desconto da categoria (Prata/Ouro) NÃO vem aplicado: o navegador aplica com src/lib/reseller.ts e o
 * servidor repete a conta ao gerar o pedido. Junto vão a categoria (segmento) e os limites de m².
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("grupo") ?? "";
  const groupId = /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
  if (!groupId) return fail(400, "Informe o grupo do produto.");
  if (!catalogProduct(groupId)) return fail(404, "Produto não encontrado.");

  const session = await getSession();
  try {
    const prices = await groupPrices(groupId, session);
    if (!prices) return fail(404, "Produto não encontrado.");
    // customerId: o navegador descarta a resposta se a sessão mudou no meio (login/logout em outra aba).
    return json({ ...prices, customerId: session?.id ?? null });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearSession();
      const fallback = await groupPrices(groupId, null);
      return json({ ...fallback, customerId: null, session: "expired" });
    }
    // Sem a tabela de revenda agora: o navegador segue com o preço do catálogo.
    return fail(502, "Não foi possível carregar a tabela de revenda agora.");
  }
}
