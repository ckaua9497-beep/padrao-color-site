/*
 * Avisos fixos de um produto na página (perto do preço) e na pré-visualização. Revisão da Padrão de 25/10/2026
 * ("prevenção anti João sem Braço"): o que o cliente poderia achar que vem junto e não vem. Chave: ID do grupo na API.
 */
const AVISOS: Record<number, string[]> = {
  // Filme Backlight e Lona Backlight: só a impressão; a caixa de luz da foto/3D não faz parte do produto.
  241: ["Caixa de luz não inclusa: o pedido é só do filme impresso."],
  334: ["Caixa de luz não inclusa: o pedido é só da lona impressa."],
};

export function avisosDoProduto(groupId: number | undefined): string[] {
  return groupId !== undefined ? (AVISOS[groupId] ?? []) : [];
}
