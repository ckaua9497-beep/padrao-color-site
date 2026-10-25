import { lerArquivo } from "@/lib/fila-pedidos/repo";

const NOME = /^[A-Za-z0-9]{1,80}\.[a-z0-9]{1,5}$/;

/**
 * Arquivo da arte guardado no site quando o Bunny não recebeu (src/lib/fila-pedidos): é a URL que vai em
 * arte.anexos e que a produção da Padrão baixa. O nome tem 16 caracteres aleatórios; sempre baixa como anexo (nunca
 * abre no navegador: SVG ou PDF de cliente não roda no domínio do site).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/pedidos/arquivo/[nome]">) {
  const { nome } = await ctx.params;
  if (!NOME.test(nome)) return new Response("Não encontrado", { status: 404 });
  const arquivo = await lerArquivo(nome).catch(() => null);
  if (!arquivo) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(arquivo.bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
