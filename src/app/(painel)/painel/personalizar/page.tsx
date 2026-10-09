import type { Metadata } from "next";
import Editor from "@/components/painel/editor/Editor";
import { requirePainel } from "@/lib/multiloja/auth";
import { lojaInfo } from "@/lib/multiloja/repo";
import { lojaUrl } from "@/lib/multiloja/tenant";
import { vitrineDados } from "@/lib/multiloja/vitrine";

export const metadata: Metadata = { title: "Personalizar loja" };

/** Editor da loja em tela cheia: modelos prontos, seções, estilo e prévia ao vivo (rascunho → publicar). */
export default async function PainelPersonalizar() {
  const { loja } = await requirePainel();
  const dados = await vitrineDados(loja);
  return (
    <Editor
      inicial={loja.temaRascunho ?? loja.tema}
      publicado={loja.tema}
      info={lojaInfo(loja)}
      lojaUrl={await lojaUrl(loja)}
      ctx={{
        categorias: dados.categorias.map(({ slug, name }) => ({ slug, name })),
        produtos: dados.produtos.map((p) => ({ id: p.id, name: p.name, image: p.image, categorySlug: p.categorySlug })),
        temWhatsapp: Boolean(loja.whatsapp),
      }}
    />
  );
}
