import "server-only";

import { randomBytes } from "node:crypto";
import { unstable_cache } from "next/cache";
import { sqlDaysAgo } from "./multiloja/core";
import { getDb } from "./multiloja/db";
import { IMAGE_TYPES, sniffImage } from "./multiloja/files";
import { bannersNoAr, comPadrao, dimensoesImagem, imagensEmUso, montarMidia, type Banner, type ImagemSite, type LugarBanner, type Midia } from "./midia";
import { MIDIA_PADRAO } from "./midia-padrao";

/*
 * Imagens e banners trocados no admin (/admin/site), no banco: tabela `site_midia` (um registro por chave:
 * "produto/<grupo>", "categoria/<slug>", "banners/<lugar>") e os arquivos em `arquivos` com dono "site", servidos
 * por /api/site/imagem/<nome> com cache longo (o nome muda a cada envio).
 *
 * As páginas da loja leem tudo por `midiaDoSite()`, guardado no cache do Next com a etiqueta TAG_MIDIA: as páginas
 * geradas no build (produto, categoria, início) continuam estáticas e se refazem no próximo acesso depois que o admin
 * salva (updateTag nas ações). Num servidor só, vale na hora; com várias instâncias, cada uma precisa do mesmo cache.
 */

export const TAG_MIDIA = "site-midia";

async function lerTudo(): Promise<Midia> {
  const linhas = await (await getDb()).all<{ chave: string; valor: string }>("SELECT chave, valor FROM site_midia");
  return montarMidia(linhas);
}

// Chave nova a cada processo: um build (ou o servidor reiniciado) sempre lê o banco na primeira vez, em vez de
// reaproveitar o que ficou em .next/cache de outra execução. A etiqueta é a mesma, então salvar no admin continua
// refazendo as páginas geradas no build.
const emCache = unstable_cache(lerTudo, ["site-midia", randomBytes(6).toString("hex")], { tags: [TAG_MIDIA], revalidate: 86_400 });

// Banco fora do ar (ex.: build sem o banco): usa as imagens da API e só tenta de novo depois de um minuto, para não
// esperar o tempo de conexão em cada página.
const estado = globalThis as typeof globalThis & { __midiaForaDoArAte?: number; __midiaLimpezaEm?: number };

const noBuild = () => process.env.NEXT_PHASE === "phase-production-build";
const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Imagens das páginas da loja (com cache): as trocas do admin por cima das imagens padrão do site (midia-padrao.ts).
 * Sem banco, só as padrão. No build tenta de novo algumas vezes (vários processos disputam o banco ao mesmo tempo),
 * para nenhuma página sair sem as trocas.
 */
export async function midiaDoSite(): Promise<Midia> {
  if (Date.now() < (estado.__midiaForaDoArAte ?? 0)) return MIDIA_PADRAO;
  // Cada página faz a própria chamada ao cache (é ela que liga a página à etiqueta TAG_MIDIA); só a falha é lembrada.
  const tentativas = noBuild() ? 4 : 1;
  for (let i = 1; ; i++) {
    try {
      return comPadrao(await emCache(), MIDIA_PADRAO);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : String(error);
      // Sem DATABASE_URL não adianta tentar de novo; outros erros (banco ocupado no build) tentam mais vezes.
      if (i < tentativas && !mensagem.startsWith("Configure DATABASE_URL")) {
        await espera(500 * i);
        continue;
      }
      if (Date.now() >= (estado.__midiaForaDoArAte ?? 0)) console.warn("[site] imagens do admin indisponíveis; usando as padrão do site:", mensagem);
      estado.__midiaForaDoArAte = Date.now() + 60_000;
      return MIDIA_PADRAO;
    }
  }
}

/** O que está salvo agora, sem cache e sem as imagens padrão (para o admin editar e saber o que é dele). */
export function midiaAtual(): Promise<Midia> {
  return lerTudo();
}

/** Dia de hoje em Brasília (AAAA-MM-DD), para o período dos banners. */
export function hojeEmBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Banners de um lugar que estão no ar hoje. */
export async function bannersDoLugar(lugar: LugarBanner): Promise<Banner[]> {
  return bannersNoAr((await midiaDoSite()).banners[lugar], hojeEmBrasilia());
}

export async function gravarMidia(chave: string, valor: unknown, autor: string): Promise<void> {
  await (await getDb()).run(
    "INSERT INTO site_midia (chave, valor, atualizado_por) VALUES (?, ?, ?) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = agora(), atualizado_por = EXCLUDED.atualizado_por",
    [chave, JSON.stringify(valor), autor],
  );
}

export async function apagarMidia(chave: string): Promise<void> {
  await (await getDb()).run("DELETE FROM site_midia WHERE chave = ?", [chave]);
}

// ---------------------------------------------------------------------------------- arquivos

const NOME = /^[a-z0-9-]{8,64}\.(png|jpg|webp)$/;

export type Envio = { ok: true; imagem: ImagemSite } | { ok: false; erro: string };

/**
 * Guarda uma imagem enviada no admin. O tipo vem dos bytes (não da extensão), e o tamanho é lido do cabeçalho para
 * o site reservar o espaço certo (sem a página pular quando a imagem carrega).
 */
export async function guardarImagem(file: File, prefixo: "produto" | "categoria" | "banner", maxBytes: number): Promise<Envio> {
  if (!file.size) return { ok: false, erro: "Arquivo vazio." };
  if (file.size > maxBytes) return { ok: false, erro: `A imagem passa de ${Math.round(maxBytes / 1024 / 1024)} MB. Diminua e envie de novo.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) return { ok: false, erro: "Envie uma imagem PNG, JPG ou WebP." };
  const dim = dimensoesImagem(bytes);
  if (!dim) return { ok: false, erro: "Não deu para ler o tamanho desta imagem. Salve de novo como PNG ou JPG." };
  if (dim.w < 100 || dim.h < 100) return { ok: false, erro: `Imagem pequena demais (${dim.w} × ${dim.h} px).` };
  if (dim.w * dim.h > 40_000_000) return { ok: false, erro: `Imagem grande demais (${dim.w} × ${dim.h} px). Use até 40 megapixels.` };
  const nome = `${prefixo}-${randomBytes(8).toString("hex")}.${ext}`;
  await (await getDb()).run("INSERT INTO arquivos (dono, nome, tipo, tamanho, dados) VALUES (?, ?, ?, ?, ?)", ["site", nome, IMAGE_TYPES[ext], bytes.byteLength, Buffer.from(bytes)]);
  return { ok: true, imagem: { src: `/api/site/imagem/${nome}`, w: dim.w, h: dim.h } };
}

export async function lerImagem(nome: string): Promise<{ bytes: Buffer; tipo: string } | null> {
  if (!NOME.test(nome)) return null;
  const row = await (await getDb()).get<{ tipo: string; dados: Buffer }>("SELECT tipo, dados FROM arquivos WHERE dono = 'site' AND nome = ?", [nome]);
  return row ? { bytes: row.dados, tipo: row.tipo } : null;
}

/**
 * Apaga as imagens enviadas que nenhum registro usa mais e que têm mais de 7 dias (as recentes podem estar num
 * formulário ainda não salvo). Roda no máximo uma vez por hora.
 */
export async function limparImagensSoltas(): Promise<number> {
  const agora = Date.now();
  if (agora - (estado.__midiaLimpezaEm ?? 0) < 3_600_000) return 0;
  estado.__midiaLimpezaEm = agora;
  const usadas = imagensEmUso(await lerTudo());
  const db = await getDb();
  const antigas = await db.all<{ nome: string }>("SELECT nome FROM arquivos WHERE dono = 'site' AND criado_em < ?", [sqlDaysAgo(7)]);
  let apagadas = 0;
  for (const { nome } of antigas) {
    if (usadas.has(nome)) continue;
    apagadas += await db.run("DELETE FROM arquivos WHERE dono = 'site' AND nome = ?", [nome]);
  }
  return apagadas;
}
