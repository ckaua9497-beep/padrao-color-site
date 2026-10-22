/*
 * Imagens e banners do site da Padrão trocados no admin (/admin/site), puros e testados. A API continua sendo a fonte
 * do catálogo; aqui só se decide o que aparece no lugar dela:
 * - fotos de um produto (a primeira é a capa dos cards), com a opção de manter as da API depois das próprias;
 * - imagem e banner (computador e celular) de uma categoria;
 * - banners da página inicial (carrossel do topo e faixas promocionais), com período no ar.
 * Por baixo do admin ficam as imagens padrão do site (midia-padrao.ts, do Figma), juntadas por `comPadrao`.
 * As chamadas ao banco e o cache ficam em midia-servidor.ts.
 */

export type ImagemSite = { src: string; w: number; h: number };

export type MidiaProduto = { imagens: string[]; manterApi: boolean };

export type MidiaCategoria = { imagem: string | null; banner: string | null; bannerMobile: string | null };

export type LugarBanner = "inicio-topo" | "inicio-meio";

export type Banner = {
  id: string;
  desktop: ImagemSite;
  /** Sem a do celular, o celular usa a do computador. */
  mobile: ImagemSite | null;
  alt: string;
  href: string | null;
  novaAba: boolean;
  ativo: boolean;
  /** Período no ar (AAAA-MM-DD, dia de Brasília); null = sem limite. */
  inicio: string | null;
  fim: string | null;
  /** Faixas: linha em que a faixa fica (as da mesma linha dividem a largura com a mesma altura). */
  linha?: number | null;
};

export type Midia = {
  produtos: Record<string, MidiaProduto>;
  categorias: Record<string, MidiaCategoria>;
  banners: Record<LugarBanner, Banner[]>;
};

export const MIDIA_VAZIA: Midia = { produtos: {}, categorias: {}, banners: { "inicio-topo": [], "inicio-meio": [] } };

/** Lugares de banner: nome no admin, quantos cabem e o tamanho recomendado (o mesmo dos banners do site atual). */
export const LUGARES_BANNER: Record<LugarBanner, { nome: string; descricao: string; limite: number; desktop: { w: number; h: number }; mobile: { w: number; h: number } | null }> = {
  "inicio-topo": {
    nome: "Carrossel do topo",
    descricao: "A primeira coisa da página inicial. Passa sozinho a cada 5 segundos. Sem nada salvo aqui, entram os banners padrão do site (os do Figma).",
    limite: 8,
    desktop: { w: 1920, h: 600 },
    mobile: { w: 1080, h: 1350 },
  },
  "inicio-meio": {
    nome: "Faixas promocionais",
    descricao: "Logo depois de “Mais vendidos”: uma faixa ocupa a linha inteira; duas ou três dividem a linha. Sem nada salvo aqui, entra o banner padrão “Cartões de visita e postais”.",
    limite: 9,
    desktop: { w: 615, h: 205 },
    mobile: null,
  },
};

export const LUGARES: LugarBanner[] = ["inicio-topo", "inicio-meio"];

export const isLugarBanner = (value: unknown): value is LugarBanner => value === "inicio-topo" || value === "inicio-meio";

/**
 * Chave de um produto nas trocas: o id do catálogo (não muda com o nome). É o número do grupo da API, menos nos
 * produtos derivados de um grupo (ex.: "tags", tirado do grupo 180), que têm id próprio.
 */
export function chaveProduto(p: { id: string }): string {
  return p.id;
}

// ---------------------------------------------------------------------------------- aplicar no catálogo

/** Fotos do produto com a troca: as próprias primeiro (a primeira vira a capa) e, se pedido, as da API depois. */
export function fotosDoProduto(api: readonly string[], capaApi: string, troca: MidiaProduto | undefined): { image: string; images: string[] } {
  const daApi = api.length ? [...api] : [capaApi];
  if (!troca?.imagens.length) return { image: capaApi, images: daApi };
  const images = troca.manterApi ? [...troca.imagens, ...daApi.filter((src) => !troca.imagens.includes(src))] : [...troca.imagens];
  return { image: images[0], images };
}

/** Produto (ou resumo de card) com as fotos trocadas no admin. Sem troca, devolve o mesmo objeto. */
export function produtoComMidia<T extends { id: string; image: string; images?: string[] }>(p: T, midia: Midia): T {
  const troca = midia.produtos[chaveProduto(p)];
  if (!troca?.imagens.length) return p;
  const fotos = fotosDoProduto(p.images ?? [], p.image, troca);
  return p.images ? { ...p, image: fotos.image, images: fotos.images } : { ...p, image: fotos.image };
}

export function produtosComMidia<T extends { id: string; image: string; images?: string[] }>(lista: T[], midia: Midia): T[] {
  return Object.keys(midia.produtos).length ? lista.map((p) => produtoComMidia(p, midia)) : lista;
}

/** Categoria com a imagem e o banner trocados (banner sem versão de celular usa o do computador). */
export function categoriaComMidia<T extends { slug: string; image: string; banner?: string | null; bannerMobile?: string | null }>(c: T, midia: Midia): T {
  const troca = midia.categorias[c.slug];
  if (!troca) return c;
  return { ...c, image: troca.imagem ?? c.image, ...(troca.banner ? { banner: troca.banner, bannerMobile: troca.bannerMobile } : {}) };
}

export function categoriasComMidia<T extends { slug: string; image: string; banner?: string | null; bannerMobile?: string | null }>(lista: T[], midia: Midia): T[] {
  return Object.keys(midia.categorias).length ? lista.map((c) => categoriaComMidia(c, midia)) : lista;
}

/**
 * O que o admin salvou por cima das imagens padrão do site: fotos de produto por produto; imagem e banner de categoria
 * campo a campo (um banner salvo não apaga a imagem padrão); banners de um lugar, a lista salva quando existe.
 * Para tirar todos os banners de um lugar, o admin desliga cada um (a lista continua salva).
 */
export function comPadrao(banco: Midia, padrao: Midia): Midia {
  const categorias: Record<string, MidiaCategoria> = { ...padrao.categorias };
  for (const [slug, salvo] of Object.entries(banco.categorias)) {
    const base = padrao.categorias[slug];
    categorias[slug] = salvo.banner
      ? { imagem: salvo.imagem ?? base?.imagem ?? null, banner: salvo.banner, bannerMobile: salvo.bannerMobile }
      : { imagem: salvo.imagem ?? base?.imagem ?? null, banner: base?.banner ?? null, bannerMobile: base?.bannerMobile ?? null };
  }
  const banners = { ...padrao.banners };
  for (const lugar of LUGARES) if (banco.banners[lugar].length) banners[lugar] = banco.banners[lugar];
  return { produtos: { ...padrao.produtos, ...banco.produtos }, categorias, banners };
}

/**
 * Faixas agrupadas em linhas, na ordem das linhas e, dentro de cada uma, na ordem do admin. Faixa sem linha fica na
 * linha da anterior (a primeira, na 1). Sem nenhuma linha escolhida, três por linha.
 */
export function linhasDeFaixas<T extends Pick<Banner, "linha">>(faixas: readonly T[]): T[][] {
  if (!faixas.some((f) => f.linha)) {
    const linhas: T[][] = [];
    for (let i = 0; i < faixas.length; i += 3) linhas.push(faixas.slice(i, i + 3));
    return linhas;
  }
  const porLinha = new Map<number, T[]>();
  let anterior = 1;
  for (const f of faixas) {
    const n = f.linha ?? anterior;
    anterior = n;
    porLinha.set(n, [...(porLinha.get(n) ?? []), f]);
  }
  return [...porLinha.entries()].sort((a, b) => a[0] - b[0]).map(([, lista]) => lista);
}

/** Banners que aparecem hoje: ligados e dentro do período (datas AAAA-MM-DD comparadas como texto). */
export function bannersNoAr(lista: readonly Banner[], hoje: string): Banner[] {
  return lista.filter((b) => b.ativo && (!b.inicio || b.inicio <= hoje) && (!b.fim || b.fim >= hoje));
}

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Situação de um banner no admin: no ar, agendado, encerrado ou desligado. */
export function statusDoBanner(b: Pick<Banner, "ativo" | "inicio" | "fim">, hoje: string): { tom: "ok" | "warn" | "off"; texto: string } {
  if (!b.ativo) return { tom: "off", texto: "Desligado" };
  if (b.inicio && b.inicio > hoje) return { tom: "warn", texto: `Entra no ar em ${dataCurta(b.inicio)}` };
  if (b.fim && b.fim < hoje) return { tom: "off", texto: `Saiu do ar em ${dataCurta(b.fim)}` };
  return { tom: "ok", texto: b.fim ? `No ar até ${dataCurta(b.fim)}` : "No ar" };
}

/**
 * Aviso sobre o tamanho de uma imagem de banner: proporção bem diferente da recomendada (vai ser cortada) ou largura
 * pequena (fica borrada em tela grande). `proporcao` false = o lugar aceita qualquer proporção.
 */
export function avisoDeTamanho(img: ImagemSite, ideal: { w: number; h: number }, proporcao = true): string | null {
  const atual = img.w / img.h;
  const certa = ideal.w / ideal.h;
  if (proporcao && Math.abs(atual - certa) / certa > 0.08) return `Proporção diferente da recomendada (${ideal.w} × ${ideal.h}): as bordas vão ser cortadas.`;
  if (img.w < ideal.w * 0.7) return `Imagem estreita (${img.w} px): pode ficar borrada em telas grandes. O ideal é ${ideal.w} px de largura.`;
  return null;
}

// ---------------------------------------------------------------------------------- validação do que vem do admin

const SITE_IMG = /^\/api\/site\/imagem\/[a-z0-9-]{8,64}\.(png|jpg|webp)$/;
// Arquivos do próprio site em public/: as imagens padrão (public/site/) e as fotos dos produtos novos.
const LOCAL_IMG = /^\/(site\/(produtos|categorias|banners|marca)|produtos-novos)\/[a-z0-9-]{1,80}\.(png|jpg|webp)$/;
// Fotos da API (os nomes têm espaços); nada de aspas, sinais de tag ou barra invertida.
const API_IMG = /^https:\/\/img\.padraocolor\.com\.br\/padraocolor\/imagens\/[^"'<>\\\s][^"'<>\\]{0,299}$/;

/** Imagem que o site aceita salvar: enviada pelo admin (/api/site/imagem/…), do próprio site (public/) ou do servidor de imagens da Padrão. */
export function imagemPermitida(src: unknown): src is string {
  return typeof src === "string" && (SITE_IMG.test(src) || LOCAL_IMG.test(src) || API_IMG.test(src));
}

export function imagemEnviada(src: string): string | null {
  const m = /^\/api\/site\/imagem\/([a-z0-9-]{8,64}\.(?:png|jpg|webp))$/.exec(src);
  return m ? m[1] : null;
}

/** Link de banner: caminho do próprio site ("/categoria/…", sem "//") ou endereço https. */
export function linkPermitido(href: string): boolean {
  if (href.startsWith("/")) return !href.startsWith("//") && !href.includes("\\") && href.length <= 300 && !/\s/.test(href);
  try {
    const url = new URL(href);
    return url.protocol === "https:" && href.length <= 500 && !/\s/.test(href);
  } catch {
    return false;
  }
}

const DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ID = /^[a-z0-9-]{6,40}$/;

const texto = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

function lerImagem(raw: unknown): ImagemSite | null {
  if (!raw || typeof raw !== "object") return null;
  const { src, w, h } = raw as Record<string, unknown>;
  const ok = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 12_000;
  return imagemPermitida(src) && ok(w) && ok(h) ? { src, w: w as number, h: h as number } : null;
}

export type Leitura<T> = { ok: true; valor: T } | { ok: false; erro: string };

/** Banner que veio do admin, conferido campo a campo. */
export function lerBanner(raw: unknown): Leitura<Banner> {
  if (!raw || typeof raw !== "object") return { ok: false, erro: "Banner inválido." };
  const b = raw as Record<string, unknown>;
  const id = typeof b.id === "string" && ID.test(b.id) ? b.id : null;
  if (!id) return { ok: false, erro: "Banner sem identificação." };
  const desktop = lerImagem(b.desktop);
  if (!desktop) return { ok: false, erro: "Falta a imagem do computador." };
  const mobile = b.mobile == null ? null : lerImagem(b.mobile);
  if (b.mobile != null && !mobile) return { ok: false, erro: "A imagem do celular não é válida." };
  const alt = texto(b.alt, 140);
  if (!alt) return { ok: false, erro: "Escreva o texto alternativo (o que o banner mostra, para quem não vê a imagem)." };
  const href = texto(b.href, 500) || null;
  if (href && !linkPermitido(href)) return { ok: false, erro: "Link inválido: use um caminho do site (/categoria/…) ou um endereço https." };
  const inicio = typeof b.inicio === "string" && DATA.test(b.inicio) ? b.inicio : null;
  const fim = typeof b.fim === "string" && DATA.test(b.fim) ? b.fim : null;
  if (inicio && fim && fim < inicio) return { ok: false, erro: "A data de fim vem antes da de início." };
  const linha = typeof b.linha === "number" && Number.isInteger(b.linha) && b.linha >= 1 && b.linha <= 9 ? b.linha : null;
  return { ok: true, valor: { id, desktop, mobile, alt, href, novaAba: b.novaAba === true, ativo: b.ativo !== false, inicio, fim, linha } };
}

/** Lista de banners de um lugar (até o limite do lugar). */
export function lerBanners(raw: unknown, lugar: LugarBanner): Leitura<Banner[]> {
  if (!Array.isArray(raw)) return { ok: false, erro: "Lista de banners inválida." };
  if (raw.length > LUGARES_BANNER[lugar].limite) return { ok: false, erro: `Cabem até ${LUGARES_BANNER[lugar].limite} banners aqui.` };
  const banners: Banner[] = [];
  for (const [i, item] of raw.entries()) {
    const lido = lerBanner(item);
    if (!lido.ok) return { ok: false, erro: `Banner ${i + 1}: ${lido.erro}` };
    if (banners.some((b) => b.id === lido.valor.id)) return { ok: false, erro: "Banner repetido." };
    banners.push(lido.valor);
  }
  return { ok: true, valor: banners };
}

/** Fotos de um produto que vieram do admin: só imagens enviadas ou fotos da API, sem repetir, até 12. */
export function lerMidiaProduto(raw: unknown): Leitura<MidiaProduto> {
  if (!raw || typeof raw !== "object") return { ok: false, erro: "Dados inválidos." };
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.imagens)) return { ok: false, erro: "Lista de fotos inválida." };
  if (r.imagens.length > 12) return { ok: false, erro: "Cabem até 12 fotos por produto." };
  if (!r.imagens.every(imagemPermitida)) return { ok: false, erro: "Uma das fotos não é válida." };
  const imagens = [...new Set(r.imagens as string[])];
  return { ok: true, valor: { imagens, manterApi: r.manterApi === true } };
}

/** Imagem e banner de uma categoria vindos do admin (cada um pode ficar vazio = o da API). */
export function lerMidiaCategoria(raw: unknown): Leitura<MidiaCategoria> {
  if (!raw || typeof raw !== "object") return { ok: false, erro: "Dados inválidos." };
  const r = raw as Record<string, unknown>;
  const campo = (value: unknown) => (value == null || value === "" ? null : imagemPermitida(value) ? value : undefined);
  const imagem = campo(r.imagem);
  const banner = campo(r.banner);
  const bannerMobile = campo(r.bannerMobile);
  if (imagem === undefined || banner === undefined || bannerMobile === undefined) return { ok: false, erro: "Uma das imagens não é válida." };
  if (bannerMobile && !banner) return { ok: false, erro: "Envie o banner do computador antes do de celular." };
  return { ok: true, valor: { imagem, banner, bannerMobile } };
}

/** Lê o que está guardado no banco (formato já conferido ao salvar; aqui só se descarta o que estiver quebrado). */
export function montarMidia(linhas: readonly { chave: string; valor: string }[]): Midia {
  const midia: Midia = { produtos: {}, categorias: {}, banners: { "inicio-topo": [], "inicio-meio": [] } };
  for (const { chave, valor } of linhas) {
    let dado: unknown;
    try {
      dado = JSON.parse(valor);
    } catch {
      continue;
    }
    const [tipo, ...resto] = chave.split("/");
    const nome = resto.join("/");
    if (tipo === "produto" && nome) {
      const lido = lerMidiaProduto(dado);
      if (lido.ok && lido.valor.imagens.length) midia.produtos[nome] = lido.valor;
    } else if (tipo === "categoria" && nome) {
      const lido = lerMidiaCategoria(dado);
      if (lido.ok && (lido.valor.imagem || lido.valor.banner)) midia.categorias[nome] = lido.valor;
    } else if (tipo === "banners" && isLugarBanner(nome)) {
      const lido = lerBanners(dado, nome);
      if (lido.ok) midia.banners[nome] = lido.valor;
    }
  }
  return midia;
}

/** Todas as imagens enviadas (/api/site/imagem/…) que algum registro usa, para apagar as que sobraram. */
export function imagensEmUso(midia: Midia): Set<string> {
  const usadas = new Set<string>();
  const add = (src: string | null | undefined) => {
    const nome = src ? imagemEnviada(src) : null;
    if (nome) usadas.add(nome);
  };
  for (const p of Object.values(midia.produtos)) p.imagens.forEach(add);
  for (const c of Object.values(midia.categorias)) [c.imagem, c.banner, c.bannerMobile].forEach(add);
  for (const lista of Object.values(midia.banners)) for (const b of lista) [b.desktop.src, b.mobile?.src].forEach(add);
  return usadas;
}

// ---------------------------------------------------------------------------------- tamanho da imagem enviada

/** Largura e altura lidas do cabeçalho do PNG, JPEG ou WebP (sem decodificar a imagem). Null = não deu para ler. */
export function dimensoesImagem(bytes: Uint8Array): { w: number; h: number } | null {
  const u16be = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const u32be = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  const ascii = (i: number, n: number) => String.fromCharCode(...bytes.subarray(i, i + n));
  const ok = (w: number, h: number) => (w > 0 && h > 0 ? { w, h } : null);
  // PNG: assinatura de 8 bytes e o bloco IHDR.
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === "PNG" && ascii(12, 4) === "IHDR") return ok(u32be(16), u32be(20));
  // JPEG: percorre os marcadores até um SOF (início de quadro) com altura e largura.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
        i += marker === 0xff ? 1 : 2;
        continue;
      }
      const length = u16be(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return ok(u16be(i + 7), u16be(i + 5));
      if (length < 2) return null;
      i += 2 + length;
    }
    return null;
  }
  // WebP: RIFF…WEBP com bloco VP8 (com perda), VP8L (sem perda) ou VP8X (estendido).
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return ok((bytes[26] | (bytes[27] << 8)) & 0x3fff, (bytes[28] | (bytes[29] << 8)) & 0x3fff);
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
      return ok((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (chunk === "VP8X") return ok((bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1, (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1);
  }
  return null;
}

// ---------------------------------------------------------------------------------- de onde vem cada foto (admin)

export type OrigemFoto = "enviada" | "padrao" | "api";

/**
 * De onde vem uma foto da lista de um produto no admin: enviada pelo admin (/api/site/imagem/…), uma das imagens
 * padrão do site daquele produto (midia-padrao.ts) ou uma das fotos que a API manda para ele. Null = não é dele (a
 * ação de salvar recusa; uma imagem padrão de outro produto também não vale).
 */
export function origemDaFoto(src: string, fontes: { api: readonly string[]; padrao: readonly string[] }): OrigemFoto | null {
  if (imagemEnviada(src)) return "enviada";
  if (fontes.padrao.includes(src)) return "padrao";
  if (fontes.api.includes(src)) return "api";
  return null;
}
