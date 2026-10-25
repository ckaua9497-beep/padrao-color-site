import "server-only";

import { catalogView, catalogoEstatico, getCategories, getProducts, storefront, type CatalogView, type Product } from "./catalog";
import { mapGroup, variationRows, type GroupLike } from "./catalog-map";
import { aplicarGrupo, categoriasDoCatalogo, montarCatalogo } from "./catalogo-grupos";
import { apiUnavailable } from "./api/client";
import { getGrupos, getProdutos } from "./api/padrao";

/*
 * Catálogo em tempo real no servidor (regras em catalogo-grupos.ts). Ligado com PADRAO_CATALOGO_VIVO=true, que pede
 * o IP do servidor liberado no firewall da Padrão; desligado (e no `next build`, que não chama a API em cada página),
 * vale o catalog.json do sync, como antes.
 *
 * - GET /grupos (ativos e dados do grupo): cache de 10 min.
 * - GET /produtos?id_grupo= (variações, preços, prazos): 10 min para a página do produto e o preço do carrinho; as
 *   listagens usam o que estiver no cache e renovam em segundo plano o que passou de 30 min, 2 grupos por vez (o
 *   client.ts segura no máximo 6 consultas por processo; o firewall bloqueia quem abre conexões demais).
 * - Erro ou API fora do ar: fica o último dado bom; sem nenhum, o do sync.
 *
 * As páginas que usam isto revalidam a cada 10 min (`revalidate = 600`).
 */

// PADRAO_CATALOGO_VIVO_TTL (segundos) encurta o cache para testar com o simulador (scripts/padrao-mock.mjs).
const TTL = (Number(process.env.PADRAO_CATALOGO_VIVO_TTL) || 600) * 1000;
const GRUPOS_TTL = TTL;
const PRODUTO_TTL = TTL;
const AQUECER_TTL = TTL * 3;
const AQUECER_PARALELO = 2;

/** Catálogo vivo ligado neste processo? */
export function catalogoVivoLigado(): boolean {
  return process.env.PADRAO_CATALOGO_VIVO === "true" && process.env.NEXT_PHASE !== "phase-production-build";
}

type Grupos = { at: number; byId: Map<number, GroupLike> };
let grupos: Grupos | null = null;
let gruposVoando: Promise<Grupos | null> | null = null;
const produtos = new Map<number, { at: number; product: Product }>();
const produtosVoando = new Map<number, Promise<Product | null>>();
/** Muda a cada dado novo: a visão do catálogo é refeita só quando muda. */
let versao = 0;
let visao: { versao: number; view: CatalogView } | null = null;
let aquecendo = false;

async function lerGrupos(): Promise<Grupos | null> {
  if (grupos && Date.now() - grupos.at < GRUPOS_TTL) return grupos;
  if (apiUnavailable()) return grupos;
  gruposVoando ??= getGrupos()
    .then((lista) => {
      // Lista vazia é falha da API, não "tudo inativo": fica a anterior.
      if (lista?.length) {
        grupos = { at: Date.now(), byId: new Map(lista.map((g) => [g.id, g])) };
        versao += 1;
      }
      return grupos;
    })
    .catch(() => grupos)
    .finally(() => {
      gruposVoando = null;
    });
  return gruposVoando;
}

/** Produto montado das variações de agora (mesmo mapGroup do sync); null sem variação válida e sem dado anterior. */
async function lerProduto(grupo: GroupLike, ttl: number): Promise<Product | null> {
  const hit = produtos.get(grupo.id);
  if (hit && Date.now() - hit.at < ttl) return hit.product;
  if (apiUnavailable()) return hit?.product ?? null;
  const pending = produtosVoando.get(grupo.id);
  if (pending) return pending;
  const request = getProdutos({ id_grupo: grupo.id }, undefined)
    .then((raw) => {
      const { rows } = variationRows(raw);
      if (!rows.length) return hit?.product ?? null;
      const product = mapGroup(grupo, rows, { featured: storefront.highlights.includes(grupo.id) });
      produtos.set(grupo.id, { at: Date.now(), product });
      versao += 1;
      return product;
    })
    .catch(() => hit?.product ?? null)
    .finally(() => produtosVoando.delete(grupo.id));
  produtosVoando.set(grupo.id, request);
  return request;
}

/** Renova em segundo plano os grupos com variações de mais de 30 min (ou nunca lidas), 2 por vez. */
function aquecer(atual: Grupos) {
  if (aquecendo) return;
  const velhos = [...atual.byId.values()].filter((g) => {
    const hit = produtos.get(g.id);
    return !hit || Date.now() - hit.at >= AQUECER_TTL;
  });
  if (!velhos.length) return;
  aquecendo = true;
  let next = 0;
  const worker = async () => {
    while (next < velhos.length && !apiUnavailable()) await lerProduto(velhos[next++], AQUECER_TTL);
  };
  void Promise.all(Array.from({ length: AQUECER_PARALELO }, worker)).finally(() => {
    aquecendo = false;
  });
}

/**
 * O catálogo para páginas e rotas: os produtos ativos com os dados de agora (ou o do sync, desligado ou sem API).
 * Mesmas funções do catalog.ts (`getProducts`, `getCategory`, `getProductsByCategory`, `getFeatured`…).
 */
export async function catalogoVivo(): Promise<CatalogView> {
  if (!catalogoVivoLigado()) return catalogoEstatico;
  const atual = await lerGrupos();
  if (!atual) return catalogoEstatico;
  aquecer(atual);
  if (visao?.versao === versao) return visao.view;
  const products = montarCatalogo(getProducts(), [...atual.byId.values()], (id) => produtos.get(id)?.product);
  const view = catalogView({ categories: categoriasDoCatalogo(getCategories(), products), products });
  visao = { versao, view };
  return view;
}

/** Produto ativo de um grupo com as variações de agora (preço do carrinho e do pedido); undefined = inativo ou desconhecido. */
export async function produtoDoGrupo(groupId: number): Promise<Product | undefined> {
  const estatico = catalogoEstatico.getProductByGroupId(groupId) ?? getProducts().find((p) => p.groupId === groupId);
  if (!catalogoVivoLigado() || estatico?.source === "site") return estatico;
  const atual = await lerGrupos();
  if (!atual) return estatico;
  const grupo = atual.byId.get(groupId);
  if (!grupo) return undefined;
  return (await lerProduto(grupo, PRODUTO_TTL)) ?? (estatico ? aplicarGrupo(estatico, grupo) : undefined);
}

/**
 * Produto da página /produto/[slug]: o produto, um redirecionamento (link antigo, grupo juntado a outro, nome que mudou)
 * ou null (404). O ID do começo do slug identifica o grupo, então o produto novo da API abre sem estar no sync.
 */
export async function produtoDaPagina(slug: string): Promise<{ product: Product } | { redirect: string } | null> {
  const id = /^(\d+)(?:-|$)/.exec(slug)?.[1] ?? null;
  const view = await catalogoVivo();
  const movido = () => {
    const moved = view.getProductMovedFrom(id ?? slug);
    return moved ? { redirect: moved.slug } : null;
  };
  if (!catalogoVivoLigado() || view === catalogoEstatico) {
    const found = view.getProduct(slug);
    return found ? { product: found } : movido();
  }
  const groupId = id !== null ? Number(id) : view.getProduct(slug)?.groupId;
  const product = groupId !== undefined ? await produtoDoGrupo(groupId) : undefined;
  if (!product) return movido();
  // Nome mudou na API (o slug vem do nome): o link antigo leva ao novo.
  return product.slug === slug ? { product } : { redirect: product.slug };
}
