// Dados institucionais da loja. Módulo leve (sem o catálogo), seguro para componentes cliente.
export const STORE = {
  name: "Padrão Color",
  tagline: "Gráfica e Comunicação Visual",
  phone: "(21) 3668-1550",
  phoneHref: "tel:+552136681550",
  email: "sac@padraocolor.com.br",
  /** WhatsApp do atendimento, (21) 97246-3737 desde 26/10/2026. */
  whatsapp: "https://api.whatsapp.com/send?phone=5521972463737",
  /** O mesmo WhatsApp com a etiqueta do setor de tratamento de arquivos (problema no pedido ou na arte). */
  whatsappTratamento: "https://wa.me/5521972463737?text=%23PROBLEMANOPEDIDO",
  address: "Rua Nicolau Cheven, Nº 255 – São João de Meriti, RJ",
  hours: "Seg a sex, 8h às 18h",
  legal: "APEL GRÁFICA E EDITORA LTDA · CNPJ 14.572.530/0001-19",
  blog: "https://blog.padraocolor.com.br/",
  social: {
    instagram: "https://www.instagram.com/padraocolor/",
    facebook: "https://www.facebook.com/padraocolor/",
    youtube: "https://www.youtube.com/channel/UCUm-Oi-n1m0kqO6-VKATmdw",
    linkedin: "https://www.linkedin.com/company/padraocolor",
    tiktok: "https://www.tiktok.com/@padraocolorbr",
  },
} as const;

/**
 * Cupom de boas-vindas da faixa laranja do topo (Figma "LOJA ONLINE - PADRAOCOLOR").
 * - O checkout deste site ainda não aplica cupom: a faixa só divulga o código. Com `ativo: false` ela some inteira; o
 *   dono do site decide com a Padrão se e como o desconto entra no pedido.
 * - Sem link de regras: a página que a loja oficial usava (/institucional/cupom-novos-clientes) hoje redireciona para
 *   a página inicial deles.
 */
export const CUPOM_BOAS_VINDAS: { readonly ativo: boolean; readonly codigo: string; readonly chamada: string; readonly acao: string } = {
  ativo: true,
  codigo: "BEMVINDO20",
  chamada: "20% de desconto na sua primeira compra",
  acao: "Use o cupom",
};
