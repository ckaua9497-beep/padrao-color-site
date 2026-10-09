import { fail, isSameOrigin, json } from "@/lib/api/guard";
import { artFileProblem, safeFileName } from "@/lib/api/validation";
import { saveOrderArt } from "@/lib/multiloja/files";
import { limited, vitrineLimits } from "@/lib/multiloja/http";
import { getPedidoByCodigo, listItens, setItemArte } from "@/lib/multiloja/repo-vendas";
import { tokenMatches } from "@/lib/multiloja/vendas";

/*
 * POST /api/multiloja/pedido/<código>/arte?t=<token>&item=<posição> (multipart, campo "arquivo").
 * Arte de um item do pedido: o PDF no gabarito que o site gerou ou o arquivo do cliente. Até 25 MB.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/multiloja/pedido/[codigo]/arte">) {
  if (!isSameOrigin(request)) return fail(403, "Origem não permitida.");
  const { codigo } = await ctx.params;
  const url = new URL(request.url);
  const pedido = await getPedidoByCodigo(codigo);
  if (!pedido || !tokenMatches(pedido, url.searchParams.get("t"))) return fail(404, "Pedido não encontrado.");
  if (pedido.status === "cancelado" || pedido.status === "entregue" || pedido.status === "enviado") return fail(409, "Este pedido não recebe mais arquivos.");
  if (limited(vitrineLimits.arte, request, `arte:${pedido.id}`)) return fail(429, "Muitos envios seguidos. Espere alguns minutos.");

  const posicao = Number(url.searchParams.get("item"));
  const item = (await listItens(pedido.id)).find((i) => i.posicao === posicao);
  if (!item) return fail(404, "Item não encontrado.");

  if (Number(request.headers.get("content-length") ?? "0") > 26 * 1024 * 1024) return fail(413, "Arquivo grande demais.");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Envie o arquivo no campo 'arquivo'.");
  }
  const file = form.get("arquivo");
  if (!(file instanceof File)) return fail(400, "Envie o arquivo no campo 'arquivo'.");
  const name = safeFileName(file.name || "arte.pdf");
  const problem = artFileProblem(name, file.size);
  if (problem) return fail(422, problem);

  const stored = await saveOrderArt(pedido.id, posicao, file);
  await setItemArte(item.id, stored, name);
  return json({ ok: true, nome: name });
}
