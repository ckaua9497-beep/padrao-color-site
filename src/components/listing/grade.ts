/*
 * Grade dos cards de produto (VitrineCard) nas listagens e nos relacionados, como o Figma: 5 cards de ~200 px com 17 px
 * entre eles a 1280 px. As colunas seguem a largura disponível (container query no pai com `@container`), não a da
 * tela: assim a listagem com o filtro lateral aberto não espreme 5 cards em 880 px.
 *   < 38rem (608 px): 2 colunas (celular) · < 51rem (816 px): 3 · < 64rem (1024 px): 4 · a partir daí: 5.
 * Cada card fica com 190 px ou mais a partir de 3 colunas.
 */
export const GRADE_CARDS =
  "grid grid-cols-2 gap-x-3 gap-y-8 @min-[38rem]:grid-cols-3 @min-[38rem]:gap-x-[17px] @min-[51rem]:grid-cols-4 @min-[51rem]:gap-y-12 @min-[64rem]:grid-cols-5";

/** `sizes` das fotos nessa grade (largura do card). */
export const SIZES_CARDS = "(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 230px";

/** Colunas da grade em cada faixa de largura, na ordem acima. */
const COLUNAS = [2, 3, 4, 5] as const;

/*
 * Classes literais (o Tailwind só gera o que aparece escrito no código), por faixa: esconder ou mostrar.
 * A faixa 0 não tem prefixo; as seguintes valem da largura mínima para cima e sobrepõem as anteriores.
 */
const ESCONDE = ["hidden", "@min-[38rem]:hidden", "@min-[51rem]:hidden", "@min-[64rem]:hidden"] as const;
const MOSTRA = ["", "@min-[38rem]:block", "@min-[51rem]:block", "@min-[64rem]:block"] as const;

/**
 * Classes para o card `index` de uma faixa com `total` cards mostrar só linhas completas, no máximo `maxLinhas`
 * (relacionados: 10 cards são 2 linhas de 5 no computador, 2 de 4 no tablet largo, 3 de 3 no tablet e 3 de 2 no celular).
 * Com menos cards que colunas, mostra todos.
 */
export function visivelEmLinhasCompletas(index: number, total: number, maxLinhas = 3): string {
  const visivel = COLUNAS.map((colunas) => {
    const limite = total < colunas ? total : Math.min(Math.floor(total / colunas), maxLinhas) * colunas;
    return index < limite;
  });
  const classes: string[] = [];
  visivel.forEach((v, faixa) => {
    if (faixa === 0) {
      if (!v) classes.push(ESCONDE[0]);
    } else if (v !== visivel[faixa - 1]) {
      classes.push(v ? MOSTRA[faixa] : ESCONDE[faixa]);
    }
  });
  return classes.join(" ");
}
