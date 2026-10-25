import { clientIp, fail, json, limits, overLimit, readJsonBody } from "@/lib/api/guard";
import { produtoDoGrupo } from "@/lib/catalogo-vivo";
import { embalagemDe, pacotesDoPedido } from "@/lib/frete";
import { cotarFretePadrao, freteApi } from "@/lib/frete-api";

/*
 * POST /api/frete — consulta de frete da página de produto ({ cep, groupId, variationId, quantity }): a API de frete da
 * Padrão cota com a embalagem cadastrada da variação (do catálogo, nunca a que vem do navegador) e devolve as formas
 * de entrega com preço e prazo de transporte. É uma estimativa: o frete do pedido é combinado no checkout.
 */

const isInt = (value: unknown, max: number) => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max;

export async function POST(request: Request) {
  const body = await readJsonBody(request, 2 * 1024);
  if (!body.ok) return body.response;
  const api = freteApi();
  if (!api) return fail(503, "O cálculo de frete está desligado agora.", { disabled: true });
  const blocked = overLimit(limits.frete, `frete:${clientIp(request) ?? "local"}`);
  if (blocked) return blocked;

  const raw = (body.data ?? {}) as { cep?: unknown; groupId?: unknown; variationId?: unknown; quantity?: unknown };
  const cep = typeof raw.cep === "string" ? raw.cep.replace(/\D/g, "") : "";
  if (cep.length !== 8) return fail(400, "Digite os 8 números do CEP.");
  if (!isInt(raw.groupId, 1e9)) return fail(400, "Produto inválido.");
  const product = await produtoDoGrupo(raw.groupId as number);
  if (!product) return fail(404, "Produto não encontrado.");
  const variationId = isInt(raw.variationId, 1e9) ? (raw.variationId as number) : null;
  const lots = isInt(raw.quantity, 100_000) ? (raw.quantity as number) : 1;

  const found = embalagemDe(product.variations, variationId);
  // Sem medida de envio cadastrada na Padrão não dá para cotar: o atendimento combina o frete.
  if (!found) return json({ opcoes: [], semMedida: true });
  const res = await cotarFretePadrao(api, cep, pacotesDoPedido([{ id: String(variationId ?? product.groupId ?? product.id), lotes: lots, embalagem: found.embalagem }]));
  if (!res.ok) return fail(502, "Não foi possível calcular o frete agora. Tente de novo em instantes.");
  return json({ opcoes: res.opcoes, estimado: found.estimada });
}
