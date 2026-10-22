import "server-only";

import { getCategory, type ProductSummary } from "../catalog";
import { categoriaComMidia } from "../midia";
import { midiaDoSite } from "../midia-servidor";
import { whatsappLink } from "./core";
import type { Loja } from "./repo";
import { lojaCategorias, lojaItens, lojaSummary } from "./tenant";

/*
 * Dados que as seções da vitrine mostram (produtos com o preço da loja, categorias com imagem, contato), montados
 * no servidor. A mesma estrutura alimenta a página inicial da loja e a prévia do editor "Personalizar loja": no
 * navegador ela não precisa do catálogo inteiro.
 */

export type VitrineProduto = ProductSummary & { featured: boolean; ativadoEm: string };
export type VitrineCategoria = { slug: string; name: string; count: number; image: string | null };

export type VitrineDados = {
  lojaId: number;
  nome: string;
  slogan: string;
  sobre: string;
  /** Link do WhatsApp da loja (wa.me), ou null sem número. */
  whatsapp: string | null;
  produtos: VitrineProduto[];
  categorias: VitrineCategoria[];
};

export async function vitrineDados(loja: Loja): Promise<VitrineDados> {
  const [items, midia] = await Promise.all([lojaItens(loja.id, loja.margemPadrao), midiaDoSite()]);
  const imagemDaCategoria = (slug: string) => {
    const c = getCategory(slug);
    return c ? categoriaComMidia(c, midia).image : null;
  };
  return {
    lojaId: loja.id,
    nome: loja.nome,
    slogan: loja.slogan,
    sobre: loja.sobre,
    whatsapp: loja.whatsapp ? whatsappLink(loja.whatsapp, `Olá! Vim pela loja ${loja.nome}.`) : null,
    produtos: items.map((item) => ({ ...lojaSummary(item), featured: item.featured, ativadoEm: item.ativadoEm })),
    categorias: lojaCategorias(items, loja.categoriasDestaque).map((c) => ({ ...c, image: imagemDaCategoria(c.slug) })),
  };
}
