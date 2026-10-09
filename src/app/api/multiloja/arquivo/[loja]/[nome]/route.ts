import { readImage } from "@/lib/multiloja/files";

/** Logo e banners enviados pelo lojista. O nome tem parte aleatória: pode ficar em cache para sempre. */
export async function GET(_request: Request, ctx: RouteContext<"/api/multiloja/arquivo/[loja]/[nome]">) {
  const { loja, nome } = await ctx.params;
  const file = await readImage(loja, nome);
  if (!file) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
