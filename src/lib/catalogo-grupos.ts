import { groupFields, type GroupLike } from "./catalog-map.ts";
import type { Category, Product } from "./catalog";

/*
 * Catálogo em tempo real (revisão da Padrão de 25/10/2026: ativo/inativo, descrição, configuração e valores vindos da
 * API). As regras ficam aqui, puras e testadas (catalogo-grupos.test.ts); a leitura da API com cache fica em
 * catalogo-vivo.ts.
 *
 * - Ativo = está em GET /grupos. A API não tem campo de status (pergunta 3 das "Observações"): o grupo que sai de lá
 *   some das listagens e a página dele leva ao grupo em que foi juntado (GRUPOS_JUNTADOS) ou dá 404.
 * - Dados do grupo (nome, textos, categoria, imagem, marcas) vêm de /grupos; variações, preços e prazos, de
 *   /produtos?id_grupo= (o produto montado pelo mesmo mapGroup do sync). Enquanto as variações de um grupo não chegam,
 *   vale o produto do sync com os dados do grupo por cima.
 * - Grupo novo (em /grupos e fora do sync) entra quando as variações dele chegam.
 */

/** O produto do sync com os campos do grupo lidos agora (as variações e os preços continuam os do sync). */
export function aplicarGrupo(product: Product, grupo: GroupLike): Product {
  const fields = groupFields(grupo);
  // Imagem nova do grupo vai na frente das fotos; sem imagem no grupo, ficam as do produto.
  const image = grupo.imagem || product.image;
  const images = grupo.imagem ? [...new Set([grupo.imagem, ...product.images])].slice(0, 6) : product.images;
  return { ...product, ...fields, image, images };
}

/**
 * Produtos ativos, na ordem do sync e com os novos no fim. `vivo(id)`: o produto montado das variações lidas agora
 * (undefined enquanto não chegaram). Produto da API própria (`source: "site"`) não está em /grupos e fica como está.
 */
export function montarCatalogo(estaticos: readonly Product[], grupos: readonly GroupLike[], vivo: (groupId: number) => Product | undefined): Product[] {
  const ativos = new Map(grupos.map((g) => [g.id, g]));
  const vistos = new Set<number>();
  const out: Product[] = [];
  for (const product of estaticos) {
    const groupId = product.groupId;
    if (product.source === "site" || groupId === undefined) {
      out.push(product);
      continue;
    }
    const grupo = ativos.get(groupId);
    if (!grupo) continue;
    vistos.add(groupId);
    out.push(vivo(groupId) ?? aplicarGrupo(product, grupo));
  }
  for (const grupo of grupos) {
    if (vistos.has(grupo.id)) continue;
    const novo = vivo(grupo.id);
    if (novo) out.push(novo);
  }
  return out;
}

/**
 * Categorias dos produtos ativos: as do sync na mesma ordem, com contagem, menor prazo e menor preço refeitos; sem
 * produto ativo, a categoria sai. Categoria nova (de um grupo novo) entra no fim, com a foto do primeiro produto.
 */
export function categoriasDoCatalogo(estaticas: readonly Category[], products: readonly Product[]): Category[] {
  const bySlug = new Map<string, Product[]>();
  for (const p of products) bySlug.set(p.categorySlug, [...(bySlug.get(p.categorySlug) ?? []), p]);
  const resumo = (list: Product[]) => {
    const lead = list.map((p) => p.leadDays).filter((d): d is number => typeof d === "number");
    const prices = list.map((p) => p.price).filter((p) => p > 0);
    return { count: list.length, minLeadDays: lead.length ? Math.min(...lead) : null, minPrice: prices.length ? Math.min(...prices) : 0 };
  };
  const out: Category[] = [];
  for (const category of estaticas) {
    const list = bySlug.get(category.slug);
    if (!list?.length) continue;
    out.push({ ...category, ...resumo(list) });
    bySlug.delete(category.slug);
  }
  for (const [slug, list] of bySlug) {
    const cover = list.find((p) => p.featured) ?? list.find((p) => p.bestSeller) ?? list[0];
    out.push({ id: cover.categoryId, slug, name: cover.category, image: cover.image, banner: null, bannerMobile: null, metaTitle: cover.category, metaDescription: "", ...resumo(list) });
  }
  return out;
}
