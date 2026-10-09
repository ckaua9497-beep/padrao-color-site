import { getAdminSession, getPainel } from "@/lib/multiloja/auth";
import { readOrderArt } from "@/lib/multiloja/files";
import { getPedidoByCodigo, listItens } from "@/lib/multiloja/repo-vendas";
import { tokenMatches } from "@/lib/multiloja/vendas";

/**
 * GET /api/multiloja/pedido/<código>/arte/<posição> — baixa a arte de um item. Pode: o cliente (?t=token), o
 * lojista dono da loja e a Padrão (admin).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/multiloja/pedido/[codigo]/arte/[item]">) {
  const { codigo, item: posicao } = await ctx.params;
  const pedido = await getPedidoByCodigo(codigo);
  if (!pedido) return new Response("Não encontrado", { status: 404 });
  const allowed =
    tokenMatches(pedido, new URL(request.url).searchParams.get("t")) || Boolean(await getAdminSession()) || (await getPainel())?.loja.id === pedido.lojaId;
  if (!allowed) return new Response("Não encontrado", { status: 404 });

  const item = (await listItens(pedido.id)).find((i) => i.posicao === Number(posicao));
  if (!item?.arteArquivo) return new Response("Não encontrado", { status: 404 });
  const bytes = await readOrderArt(pedido.id, item.arteArquivo);
  if (!bytes) return new Response("Não encontrado", { status: 404 });
  const name = `${pedido.codigo}-item${item.posicao + 1}-${item.arteNome ?? item.arteArquivo}`.replace(/[^\w.\-]+/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
