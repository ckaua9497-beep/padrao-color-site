/*
 * Orientação da arte (revisão da Padrão de 25/10/2026): os banners de medida definida, o crachá e o quadro canvas podem
 * ser personalizados na horizontal ou na vertical, como o cliente preferir. A escolha gira a peça no 3D (troca largura e
 * altura da spec) e, com ela, o gabarito (orientPages segue a proporção da peça).
 *
 * Puro e testado (orientacao.test.ts).
 */

export type Orientacao = "horizontal" | "vertical";

/** Opções que já trazem a orientação no valor (Banner "0,80x1,20m (vertical)"): a escolha do site não aparece. */
const NA_OPCAO = /\b(vertical|horizontal)\b/i;

export type OrientacaoInput = {
  kind: string;
  variant: string | null;
  /** Nome do produto (sem acento, minúsculo). */
  name: string;
  /** Produto por m² (medida digitada: a largura e a altura já dizem a orientação). */
  medidaLivre: boolean;
  options: Record<string, string[]>;
};

/** O produto deixa escolher a orientação? */
export function orientacaoLivre({ kind, variant, name, medidaLivre, options }: OrientacaoInput): boolean {
  if (medidaLivre) return false;
  if (Object.values(options).some((values) => values.some((v) => NA_OPCAO.test(v)))) return false;
  if (kind === "canvas") return true;
  if (kind === "badge" && /\bcracha\b/.test(name)) return true;
  // Banners de medida definida (os de medida livre, faixa, mini banner e lona crua ficam de fora).
  return kind === "banner" && !["strip", "mini", "raw"].includes(variant ?? "");
}

export function orientacaoDe(widthCm: number, heightCm: number): Orientacao {
  return widthCm >= heightCm ? "horizontal" : "vertical";
}

/** A peça na orientação pedida (largura e altura trocadas quando precisa). */
export function orientar<T extends { widthCm: number; heightCm: number }>(spec: T, orientacao: Orientacao | null): T {
  if (!orientacao || orientacaoDe(spec.widthCm, spec.heightCm) === orientacao || spec.widthCm === spec.heightCm) return spec;
  return { ...spec, widthCm: spec.heightCm, heightCm: spec.widthCm };
}
