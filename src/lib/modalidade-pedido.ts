/*
 * Modalidade da compra em "Meus pedidos" (revisão da Padrão de 29/10/2026: o painel de pedidos mostra as compras feitas
 * nas 3 modalidades: System Color, Loja São João e Site). A modalidade vem no `envio` de cada compra do GET /pedidos
 * ("Site" nos pedidos do site). O GET /pedidos não filtra por ela: o filtro de Meus pedidos busca as páginas e separa
 * aqui. Os textos exatos de `envio` da loja e do System Color estão a confirmar com a Padrão; por isso o reconhecimento
 * é por palavra (sem acento e sem espaço) e o texto desconhecido aparece como veio.
 */

export type Modalidade = "system" | "loja" | "site";

/** Na ordem do painel de pedidos da Padrão. */
export const MODALIDADES: readonly { value: Modalidade; label: string }[] = [
  { value: "system", label: "System Color" },
  { value: "loja", label: "Loja São João" },
  { value: "site", label: "Site" },
];

export const MODALIDADE_LABEL: Record<Modalidade, string> = Object.fromEntries(MODALIDADES.map((m) => [m.value, m.label])) as Record<Modalidade, string>;

export function isModalidade(value: unknown): value is Modalidade {
  return typeof value === "string" && value in MODALIDADE_LABEL;
}

const limpo = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** Modalidade da compra pelo `envio` do GET /pedidos; null quando o texto não é de nenhuma das três. */
export function modalidadeDoPedido(envio: unknown): Modalidade | null {
  if (typeof envio !== "string") return null;
  const texto = limpo(envio);
  if (!texto) return null;
  if (texto.includes("system")) return "system";
  if (texto.includes("saojoao") || texto.startsWith("loja")) return "loja";
  if (texto.includes("site") || texto.includes("ecommerce") || texto.includes("online")) return "site";
  return null;
}

/** Texto da modalidade para o cartão da compra: o nome da modalidade, ou o `envio` como veio. */
export function textoDaModalidade(envio: unknown): string | null {
  const modalidade = modalidadeDoPedido(envio);
  if (modalidade) return MODALIDADE_LABEL[modalidade];
  return typeof envio === "string" && envio.trim() ? envio.trim() : null;
}
