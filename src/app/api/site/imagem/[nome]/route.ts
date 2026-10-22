import { lerImagem } from "@/lib/midia-servidor";

/**
 * Imagens enviadas no admin do site (fotos de produto, imagens e banners). O nome tem parte aleatória e muda a cada
 * envio: pode ficar em cache para sempre (navegador e CDN).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/site/imagem/[nome]">) {
  const { nome } = await ctx.params;
  const file = await lerImagem(nome);
  if (!file) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.tipo,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
