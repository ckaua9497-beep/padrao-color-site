import { clientIp, fail, json, limits, overLimit, readJsonBody } from "@/lib/api/guard";
import { cotarEntrega, type ItemFrete } from "@/lib/frete-pedido";
import { MAX_ORDER_ITEMS } from "@/lib/orders";

/*
 * POST /api/pedidos/frete — "Frete por transportadora" no checkout ({ cep, items: [{ groupId, variationId, quantity }] }):
 * cota o carrinho na API de frete da Padrão com a embalagem cadastrada de cada variação (frete-pedido.ts). O pedido cota
 * de novo no fechamento: o preço daqui só mostra as opções.
 */

const isInt = (value: unknown, max: number) => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max;

export async function POST(request: Request) {
  const body = await readJsonBody(request, 16 * 1024);
  if (!body.ok) return body.response;
  const blocked = overLimit(limits.frete, `frete:${clientIp(request) ?? "local"}`);
  if (blocked) return blocked;

  const raw = (body.data ?? {}) as { cep?: unknown; items?: unknown };
  const cep = typeof raw.cep === "string" ? raw.cep.replace(/\D/g, "") : "";
  if (cep.length !== 8) return fail(400, "Digite os 8 números do CEP.");
  if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > MAX_ORDER_ITEMS) return fail(400, "Carrinho inválido.");
  const itens: ItemFrete[] = [];
  for (const item of raw.items as Record<string, unknown>[]) {
    if (!item || typeof item !== "object" || !isInt(item.quantity, 100_000)) return fail(400, "Carrinho inválido.");
    itens.push({
      groupId: isInt(item.groupId, 1e9) ? (item.groupId as number) : undefined,
      variationId: isInt(item.variationId, 1e9) ? (item.variationId as number) : undefined,
      quantity: item.quantity as number,
    });
  }
  const cotacao = await cotarEntrega(cep, itens);
  if (cotacao.tipo === "falha") return fail(502, "Não foi possível calcular o frete agora. Tente de novo em instantes.");
  return json(cotacao);
}
