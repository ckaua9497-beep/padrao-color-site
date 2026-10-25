/*
 * Termos de envio de arte: todo produto personalizado pede o aceite antes de ir para o carrinho (passo "Sua arte").
 * Item que chegou ao checkout sem o aceite (carrinho antigo, kit, festa, fachada) pede o aceite no fechamento, e o
 * servidor recusa o pedido com item personalizado sem aceite (/api/pedidos). O aceite (versão + data) vai no pedido,
 * em desc_trabalho. Texto provisório, a validar com a Padrão: mudar o texto pede uma versão nova.
 * Puro e testado (termos-arte.test.ts).
 */

export const TERMOS_ARTE_VERSAO = "2026-10-25";

export const TERMOS_ARTE = {
  titulo: "Termos de envio de arte",
  itens: [
    "A arte é de responsabilidade de quem envia: textos, ortografia, telefones, endereços e demais dados são impressos exatamente como estão no arquivo ou no editor. A Padrão Color não revisa o conteúdo.",
    "As cores podem variar entre a tela (RGB) e o impresso (CMYK), conforme o material e o processo de impressão, e de um lote para outro.",
    "Imagem em baixa resolução pode sair pixelada ou sem nitidez. O aviso de resolução do editor não impede o pedido; a responsabilidade é de quem envia.",
    "Textos e elementos importantes devem ficar dentro da área de segurança. O que passa da linha de corte (sangria) é aparado; arte fora do gabarito é encaixada automaticamente.",
    "O mockup 3D e as prévias são ilustrativos: proporções, texturas, brilho e acabamentos do produto real podem ser diferentes.",
    "Arquivos feitos automaticamente pelo site a partir da arte (faca de corte, posição do LED, máscara de verniz) seguem o que aparece no editor. Para usar os seus, envie em “Arquivos para a produção”.",
    "Quem envia declara ter o direito de uso das imagens, marcas, fotos e textos da arte. A Padrão Color pode recusar arte com conteúdo ilegal, ofensivo ou que viole direitos de terceiros.",
    "Depois que o pedido entra em produção, a arte não pode ser trocada. Erro na arte enviada não dá direito a reimpressão sem custo.",
    "A arte fica guardada pela Padrão Color para produzir e conferir o pedido, conforme a Lei Geral de Proteção de Dados (LGPD).",
  ],
} as const;

/** Aceite dos termos: a versão aceita e quando (ISO 8601). */
export type AceiteTermos = { versao: string; em: string };

/** `artName` dos itens que não levam arte (sem personalização, neon de modelo pronto): não pedem o aceite. */
const SEM_ARTE = new Set(["modelo pronto", "produto sem impressão"]);

/** O item leva arte do cliente (personalizado)? Item sem arte ainda ("enviar depois", multiloja) também leva. */
export function levaArte(item: { artName: string | null; options?: Record<string, string> }): boolean {
  return !SEM_ARTE.has((item.artName ?? "").trim().toLowerCase());
}

export function novoAceite(agora: Date): AceiteTermos {
  return { versao: TERMOS_ARTE_VERSAO, em: agora.toISOString() };
}

/** Aceite vindo do navegador: versão atual e data válida, nada mais. null quando não serve. */
export function aceiteValido(raw: unknown): AceiteTermos | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { versao, em } = raw as Record<string, unknown>;
  if (versao !== TERMOS_ARTE_VERSAO || typeof em !== "string" || em.length > 40) return null;
  const quando = Date.parse(em);
  if (!Number.isFinite(quando)) return null;
  return { versao, em: new Date(quando).toISOString() };
}

/** "aceitos em 25/10/2026 às 14:32 (versão 2026-10-25)", no horário de Brasília. */
export function textoDoAceite(aceite: AceiteTermos): string {
  const quando = new Date(aceite.em);
  const data = quando.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = quando.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `aceitos em ${data} às ${hora} (versão ${aceite.versao})`;
}
