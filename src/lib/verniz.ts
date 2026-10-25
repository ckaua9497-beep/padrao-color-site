/*
 * Verniz localizado (revisão da Padrão de 25/10/2026): o cliente escolhe na arte o que leva verniz
 * (ArtSettings.varnish) e o site manda a máscara para a produção, em preto onde vai o verniz. Para onde vai cada
 * máscara depende dos tipos de anexo da variação: frente e verso separados ("Verniz Local Frente/Verso") quando a
 * variação tem, senão um arquivo só ("Verniz Localizado").
 *
 * Puro e testado (verniz.test.ts).
 */

export const VERNIZ_FRENTE = "Verniz Local Frente";
export const VERNIZ_VERSO = "Verniz Local Verso";
export const VERNIZ_UNICO = "Verniz Localizado";

/** Tipo de anexo de cada máscara: `juntos` = frente e verso no mesmo arquivo. null = a variação não recebe máscara. */
export type DestinoVerniz = { juntos: true; tipo: string } | { juntos: false; frente: string | null; verso: string | null };

export function destinoDoVerniz(anexos: readonly string[]): DestinoVerniz | null {
  if (anexos.includes(VERNIZ_FRENTE)) return { juntos: false, frente: VERNIZ_FRENTE, verso: anexos.includes(VERNIZ_VERSO) ? VERNIZ_VERSO : null };
  if (anexos.includes(VERNIZ_UNICO)) return { juntos: true, tipo: VERNIZ_UNICO };
  if (anexos.includes(VERNIZ_VERSO)) return { juntos: false, frente: null, verso: VERNIZ_VERSO };
  return null;
}

/** Tipos de anexo que o site preenche sozinho com a máscara (a lista dos "Arquivos para a produção"). */
export function tiposDoVerniz(destino: DestinoVerniz | null): string[] {
  if (!destino) return [];
  if (destino.juntos) return [destino.tipo];
  return [destino.frente, destino.verso].filter((tipo): tipo is string => tipo !== null);
}

/** Texto do resumo do carrinho para a escolha do cliente. */
export function vernizResumo(varnish: "tudo" | "imagem" | "texto" | null | undefined): string {
  if (varnish === "imagem") return "na imagem";
  if (varnish === "texto") return "no texto";
  return "na imagem e no texto";
}
