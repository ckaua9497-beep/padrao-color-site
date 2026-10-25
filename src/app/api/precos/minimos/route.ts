import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/client";
import { fail, json } from "@/lib/api/guard";
import { catalogProduct, fromPrice, groupPrices, linePricesFor } from "@/lib/api/prices";
import { clearSession, getSession } from "@/lib/session";

/** Grupos por chamada (a categoria maior tem 45 produtos) e consultas simultâneas à API. */
const MAX_GROUPS = 60;
const CONCURRENCY = 6;

/**
 * GET /api/precos/minimos?grupos=1,2,3: o "a partir de" dos cards (vitrines, listagens, busca) na tabela do
 * revendedor logado, já com o desconto da categoria (Prata/Ouro), o mesmo preço da página do produto.
 * → { customerId, reseller, prices: { "<grupo>": { p, q } }, failed: [grupos] }
 * Grupo ausente de `prices` = fica no preço do catálogo (conta comum, visitante ou grupo sem tabela de
 * revenda); `failed` = a API falhou agora (o navegador tenta de novo depois).
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("grupos") ?? "";
  const ids = [...new Set(raw.split(",").map((value) => value.trim()))].filter((value) => /^\d{1,9}$/.test(value)).map(Number);
  if (!ids.length || ids.length > MAX_GROUPS) return fail(400, `Informe de 1 a ${MAX_GROUPS} grupos.`);

  const session = await getSession();
  if (!session?.reseller) return json({ customerId: session?.id ?? null, reseller: false, prices: {}, failed: [] });

  // Cards: o produto da visão do catálogo em cache (sem ir à API por grupo); inativo fica fora.
  const found = await Promise.all(ids.map((id) => catalogProduct(id, { listagem: true })));
  const groups = ids.filter((_, i) => found[i]);
  const prices: Record<string, { p: number; q: number }> = {};
  const failed: number[] = [];
  let expired = false;
  // API sem conexão (503): daqui em diante só o que já está no cache, sem nenhuma conexão nova.
  let offline = false;
  let next = 0;
  const worker = async () => {
    while (next < groups.length && !expired) {
      const id = groups[next++];
      try {
        const group = await groupPrices(id, session, { cacheOnly: offline, listagem: true });
        if (!group?.reseller) continue;
        const price = fromPrice(linePricesFor(group, session).variations, { neon: Boolean(group.neon) });
        if (price) prices[id] = price;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) expired = true;
        else {
          if (error instanceof ApiError && error.status === 503) offline = true;
          failed.push(id);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, groups.length) }, worker));

  if (expired) {
    await clearSession();
    return json({ customerId: null, reseller: false, prices: {}, failed: [], session: "expired" });
  }
  return json({ customerId: session.id, reseller: true, prices, failed });
}
