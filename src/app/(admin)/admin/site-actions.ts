"use server";

import { randomBytes } from "node:crypto";
import { refresh, updateTag } from "next/cache";
import { getCategory, getProductById, storefront } from "@/lib/catalog";
import { chaveProduto, imagemPermitida, isLugarBanner, lerBanners, lerMidiaCategoria, lerMidiaProduto, LUGARES_BANNER, origemDaFoto, type Banner } from "@/lib/midia";
import { MIDIA_PADRAO } from "@/lib/midia-padrao";
import { apagarMidia, gravarMidia, guardarImagem, limparImagensSoltas, TAG_MIDIA, type Envio } from "@/lib/midia-servidor";
import { requireAdmin } from "@/lib/multiloja/auth";

/*
 * Ações do admin → Site: envio de imagens e as trocas de fotos de produto, imagem/banner de categoria e banners da
 * página inicial. Toda troca salva expira a etiqueta TAG_MIDIA: as páginas da loja se refazem no próximo acesso.
 * O que o admin salva fica por cima das imagens padrão do site (midia-padrao.ts); apagar o registro volta o padrão.
 */

export type SiteResult = { ok: boolean; message: string };

// O envio vai por Server Action (limite de 8 MB no next.config.ts): uma imagem por envio.
const LIMITE = { produto: 6 * 1024 * 1024, categoria: 6 * 1024 * 1024, banner: 7 * 1024 * 1024 } as const;

/** Uma imagem do admin (campo "arquivo"); "tipo" diz para onde ela vai (nome do arquivo e limite de tamanho). */
export async function enviarImagemSite(form: FormData): Promise<Envio> {
  await requireAdmin();
  const file = form.get("arquivo");
  const tipo = form.get("tipo");
  if (!(file instanceof File)) return { ok: false, erro: "Escolha uma imagem." };
  if (tipo !== "produto" && tipo !== "categoria" && tipo !== "banner") return { ok: false, erro: "Tipo de imagem inválido." };
  try {
    return await guardarImagem(file, tipo, LIMITE[tipo]);
  } catch (error) {
    console.error("[site] envio de imagem:", error instanceof Error ? error.message : error);
    return { ok: false, erro: "Não foi possível guardar a imagem agora. Tente de novo." };
  }
}

function publicado() {
  updateTag(TAG_MIDIA);
  refresh();
  void limparImagensSoltas().catch((error) => console.error("[site] limpeza de imagens:", error instanceof Error ? error.message : error));
}

/**
 * Fotos de um produto (pelo id do catálogo): enviadas no admin, as padrão do site daquele produto ou as da API dele.
 * Lista vazia = apaga a troca: volta a foto padrão do site (quando o produto tem) ou as da API.
 */
export async function salvarFotosProduto(productId: string, dados: unknown): Promise<SiteResult> {
  const admin = await requireAdmin();
  const product = typeof productId === "string" && /^[a-z0-9-]{1,60}$/.test(productId) ? getProductById(productId) : undefined;
  if (!product) return { ok: false, message: "Produto não encontrado." };
  const lido = lerMidiaProduto(dados);
  if (!lido.ok) return { ok: false, message: lido.erro };
  const chave = chaveProduto(product);
  // As mesmas fontes que o admin oferece: sem lista de fotos, a API manda só a capa.
  const fontes = { api: product.images.length ? product.images : [product.image], padrao: MIDIA_PADRAO.produtos[chave]?.imagens ?? [] };
  if (lido.valor.imagens.some((src) => !origemDaFoto(src, fontes))) return { ok: false, message: "Uma das fotos não é deste produto (nem enviada, nem padrão do site, nem da API)." };
  if (lido.valor.imagens.length) await gravarMidia(`produto/${chave}`, lido.valor, admin.email);
  else await apagarMidia(`produto/${chave}`);
  publicado();
  if (lido.valor.imagens.length) return { ok: true, message: "Fotos salvas. O site já mostra as novas." };
  return { ok: true, message: fontes.padrao.length ? "Pronto: o produto voltou à foto padrão do site." : "Pronto: o produto voltou às fotos da API." };
}

/** Imagem e banner de uma categoria (campo vazio = a imagem padrão do site, quando a categoria tem, ou a da API). */
export async function salvarMidiaCategoria(slug: string, dados: unknown): Promise<SiteResult> {
  const admin = await requireAdmin();
  if (typeof slug !== "string" || !getCategory(slug)) return { ok: false, message: "Categoria não encontrada." };
  const lido = lerMidiaCategoria(dados);
  if (!lido.ok) return { ok: false, message: lido.erro };
  const chave = `categoria/${slug}`;
  if (lido.valor.imagem || lido.valor.banner) await gravarMidia(chave, lido.valor, admin.email);
  else await apagarMidia(chave);
  publicado();
  if (lido.valor.imagem || lido.valor.banner) return { ok: true, message: "Categoria salva. O site já mostra as imagens novas." };
  return { ok: true, message: MIDIA_PADRAO.categorias[slug] ? "Pronto: a categoria voltou às imagens padrão do site." : "Pronto: a categoria voltou às imagens da API." };
}

/**
 * Banners de um lugar da página inicial, na ordem do admin. Lista vazia = apaga a lista salva e voltam os banners
 * padrão do site; para não mostrar banner nenhum, o admin salva a lista com todos desligados.
 */
export async function salvarBanners(lugar: string, dados: unknown): Promise<SiteResult> {
  const admin = await requireAdmin();
  if (!isLugarBanner(lugar)) return { ok: false, message: "Lugar de banner inválido." };
  const lido = lerBanners(dados, lugar);
  if (!lido.ok) return { ok: false, message: lido.erro };
  const chave = `banners/${lugar}`;
  if (lido.valor.length) await gravarMidia(chave, lido.valor, admin.email);
  else await apagarMidia(chave);
  publicado();
  if (!lido.valor.length) return { ok: true, message: lugar === "inicio-topo" ? "Lista apagada: o carrossel do topo voltou aos banners padrão do site." : "Lista apagada: as faixas promocionais voltaram ao banner padrão do site." };
  const noAr = lido.valor.filter((b) => b.ativo).length;
  return { ok: true, message: noAr ? `Banners publicados (${noAr} ligado${noAr === 1 ? "" : "s"}).` : "Banners publicados, todos desligados: nenhum banner aparece neste lugar do site." };
}

const novoId = () => `b-${randomBytes(6).toString("hex")}`;

/**
 * Banners do site atual (padraocolor.com.br, GET /configuracoes no último sync) para começar a partir deles: o topo
 * usa os banners da vitrine; as faixas usam os "botões" (Revendedor, Blog…). Não salva: o admin revisa e publica.
 */
export async function bannersDoSiteAtual(lugar: string): Promise<{ ok: true; banners: Banner[] } | { ok: false; message: string }> {
  await requireAdmin();
  if (!isLugarBanner(lugar)) return { ok: false, message: "Lugar de banner inválido." };
  const base = { mobile: null, inicio: null, fim: null, ativo: true };
  const banners: Banner[] =
    lugar === "inicio-topo"
      ? storefront.banners.flatMap((b) =>
          imagemPermitida(b.desktop) && b.desktopSize
            ? [
                {
                  ...base,
                  id: novoId(),
                  desktop: { src: b.desktop, w: b.desktopSize.w, h: b.desktopSize.h },
                  mobile: imagemPermitida(b.mobile) && b.mobileSize ? { src: b.mobile, w: b.mobileSize.w, h: b.mobileSize.h } : null,
                  alt: b.name,
                  href: b.href,
                  novaAba: Boolean(b.href && /^https?:/.test(b.href)),
                },
              ]
            : [],
        )
      : [...storefront.buttons]
          .sort((a, b) => a.row - b.row)
          .flatMap((b) => (imagemPermitida(b.image) && b.size ? [{ ...base, id: novoId(), desktop: { src: b.image, w: b.size.w, h: b.size.h }, alt: b.name, href: b.href, novaAba: b.newTab, linha: b.row }] : []));
  // Só os que passariam na conferência de quando salvar (ex.: link https ou caminho do site).
  return { ok: true, banners: banners.filter((b) => lerBanners([b], lugar).ok).slice(0, LUGARES_BANNER[lugar].limite) };
}
